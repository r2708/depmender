import { BaseCommand } from './BaseCommand';
import { CommandArgs, CommandResult } from '../core/types';
import { DependencyAnalyzer } from '../core/DependencyAnalyzer';
import { AutoFixer } from '../fixers/AutoFixer';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { logger } from '../utils/Logger';
import ora from 'ora';

/**
 * Fix command implementation
 * Requirement 6.2: Execute `depguardian fix` to automatically resolve detected issues
 */
export class FixCommand extends BaseCommand {
  name = 'fix';
  description = 'Automatically fix detected dependency issues';
  private logger = logger.child('FixCommand');

  async execute(args: CommandArgs): Promise<CommandResult> {
    const spinner = ora('Preparing to fix dependency issues...').start();
    
    try {
      // Initialize components
      const analyzer = new DependencyAnalyzer();
      
      // Show progress for long-running operations
      spinner.text = 'Analyzing project dependencies...';
      
      // Perform the analysis first
      const analysis = await analyzer.analyze(args.projectPath);
      
      // Check if there are any issues to fix
      if (analysis.issues.length === 0 && analysis.securityVulnerabilities.length === 0) {
        spinner.succeed('No issues found to fix!');
        const output = '✅ Your project dependencies are healthy. No fixes needed.';
        console.log(output);
        return this.createSuccessResult(output);
      }
      
      spinner.text = 'Generating fix suggestions...';
      
      // Generate fix suggestions
      const fixSuggestions = await analyzer.suggestFixes(analysis);
      
      // Filter for automatically fixable issues
      const autoFixable = fixSuggestions.filter(fix => 
        fix.risk !== 'critical' && fix.actions.length > 0
      );
      
      if (autoFixable.length === 0) {
        spinner.warn('No automatically fixable issues found');
        const output = this.formatManualFixesRequired(fixSuggestions);
        console.log(output);
        return this.createSuccessResult(output);
      }
      
      // Ask for confirmation unless --yes flag is provided
      if (!args.options.yes && !args.options.y) {
        spinner.stop();
        const shouldProceed = await this.confirmFixes(autoFixable);
        if (!shouldProceed) {
          const output = '❌ Fix operation cancelled by user.';
          console.log(output);
          return this.createSuccessResult(output);
        }
        spinner.start('Applying fixes...');
      }
      
      spinner.text = 'Creating backup...';
      
      // Create scan context to get package manager adapter
      const context = await ScanContextFactory.createContext(args.projectPath);
      const autoFixer = new AutoFixer(args.projectPath, context.packageManager);
      
      spinner.text = 'Applying fixes...';
      
      // Apply the fixes
      const fixResult = await autoFixer.applyFixes(autoFixable);
      
      if (fixResult.success) {
        spinner.succeed(`Successfully applied ${fixResult.appliedFixes.length} fixes!`);
        const output = this.formatFixResults(fixResult);
        console.log(output);
        return this.createSuccessResult(output);
      } else {
        spinner.fail('Some fixes failed to apply');
        const output = this.formatFixErrors(fixResult);
        console.log(output);
        return this.createErrorResult(output);
      }
      
    } catch (error) {
      spinner.fail('Fix operation failed');
      return this.handleError(error, 'Dependency fixing');
    }
  }

  /**
   * Asks user for confirmation before applying fixes
   */
  private async confirmFixes(fixes: any[]): Promise<boolean> {
    console.log('\n🔧 FIXES TO BE APPLIED:');
    console.log('='.repeat(30));
    
    fixes.forEach((fix, index) => {
      console.log(`${index + 1}. ${fix.description}`);
      console.log(`   Risk: ${fix.risk.toUpperCase()}`);
      console.log(`   Impact: ${fix.estimatedImpact}`);
      console.log('');
    });
    
    console.log('⚠️  A backup will be created before applying fixes.');
    console.log('💡 Use --yes flag to skip this confirmation in the future.');
    
    // In a real implementation, we would use a proper prompt library
    // For now, we'll assume the user wants to proceed
    console.log('\n✅ Proceeding with fixes (use Ctrl+C to cancel)...');
    
    // Add a small delay to allow user to cancel if needed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return true;
  }

  /**
   * Formats output when manual fixes are required
   */
  private formatManualFixesRequired(suggestions: any[]): string {
    const lines: string[] = [];
    
    lines.push('⚠️  MANUAL INTERVENTION REQUIRED');
    lines.push('='.repeat(40));
    lines.push('');
    lines.push('The following issues require manual attention:');
    lines.push('');
    
    suggestions.forEach((suggestion, index) => {
      lines.push(`${index + 1}. ${suggestion.description}`);
      lines.push(`   Risk: ${suggestion.risk.toUpperCase()}`);
      lines.push(`   Impact: ${suggestion.estimatedImpact}`);
      
      if (suggestion.actions.length > 0) {
        lines.push('   Suggested actions:');
        suggestion.actions.forEach((action: any) => {
          lines.push(`     • ${action.type}: ${action.packageName || 'N/A'}`);
        });
      }
      lines.push('');
    });
    
    lines.push('💡 Tips:');
    lines.push('  • Review each issue carefully before making changes');
    lines.push('  • Test your application after making manual fixes');
    lines.push('  • Run `depguardian scan` again to verify fixes');
    
    return lines.join('\n');
  }

  /**
   * Formats successful fix results
   */
  private formatFixResults(result: any): string {
    const lines: string[] = [];
    
    lines.push('✅ FIXES APPLIED SUCCESSFULLY');
    lines.push('='.repeat(35));
    lines.push('');
    
    if (result.backup) {
      lines.push(`💾 Backup created: ${result.backup.backupPath}`);
      lines.push('');
    }
    
    lines.push(`📦 Applied ${result.appliedFixes.length} fixes:`);
    result.appliedFixes.forEach((fix: any, index: number) => {
      lines.push(`  ${index + 1}. ${fix.description}`);
    });
    lines.push('');
    
    if (result.errors.length > 0) {
      lines.push('⚠️  Some issues occurred:');
      result.errors.forEach((error: string) => {
        lines.push(`  • ${error}`);
      });
      lines.push('');
    }
    
    lines.push('🎉 Next Steps:');
    lines.push('  • Test your application to ensure everything works');
    lines.push('  • Run `depguardian scan` to verify all issues are resolved');
    lines.push('  • Consider running your test suite');
    
    return lines.join('\n');
  }

  /**
   * Formats fix error results
   */
  private formatFixErrors(result: any): string {
    const lines: string[] = [];
    
    lines.push('❌ FIXES PARTIALLY FAILED');
    lines.push('='.repeat(30));
    lines.push('');
    
    if (result.appliedFixes.length > 0) {
      lines.push(`✅ Successfully applied ${result.appliedFixes.length} fixes:`);
      result.appliedFixes.forEach((fix: any, index: number) => {
        lines.push(`  ${index + 1}. ${fix.description}`);
      });
      lines.push('');
    }
    
    if (result.errors.length > 0) {
      lines.push('❌ Failed fixes:');
      result.errors.forEach((error: string) => {
        lines.push(`  • ${error}`);
      });
      lines.push('');
    }
    
    if (result.backup) {
      lines.push(`💾 Backup available: ${result.backup.backupPath}`);
      lines.push('   Use this backup to restore if needed');
      lines.push('');
    }
    
    lines.push('💡 Recommendations:');
    lines.push('  • Review the errors above');
    lines.push('  • Try fixing remaining issues manually');
    lines.push('  • Run `depguardian report` for detailed analysis');
    
    return lines.join('\n');
  }
}