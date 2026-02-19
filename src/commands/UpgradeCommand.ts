import { BaseCommand } from './BaseCommand';
import { CommandArgs, CommandResult } from '../core/types';
import { DependencyAnalyzer } from '../core/DependencyAnalyzer';
import { AutoFixer } from '../fixers/AutoFixer';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { logger } from '../utils/Logger';
import ora from 'ora';

/**
 * Upgrade command implementation
 * Upgrades all outdated dependencies to their latest versions
 */
export class UpgradeCommand extends BaseCommand {
  name = 'upgrade';
  description = 'Upgrade all dependencies to their latest versions';
  private logger = logger.child('UpgradeCommand');

  async execute(args: CommandArgs): Promise<CommandResult> {
    const spinner = ora('Preparing to upgrade dependencies...').start();
    
    try {
      // Initialize components
      const analyzer = new DependencyAnalyzer();
      
      spinner.text = 'Analyzing project dependencies...';
      
      // Perform the analysis first
      const analysis = await analyzer.analyze(args.projectPath);
      
      // Filter for outdated packages
      const outdatedIssues = analysis.issues.filter((issue: any) => issue.type === 'outdated');
      
      if (outdatedIssues.length === 0) {
        spinner.succeed('All dependencies are up to date!');
        const output = '✅ Your project dependencies are already at their latest versions.';
        console.log(output);
        return this.createSuccessResult(output);
      }
      
      spinner.text = 'Generating upgrade plan...';
      
      // Generate fix suggestions for outdated packages
      const fixSuggestions = await analyzer.suggestFixes(analysis);
      const upgradeFixes = fixSuggestions.filter(fix => 
        fix.actions.some((action: any) => action.type === 'update')
      );
      
      if (upgradeFixes.length === 0) {
        spinner.warn('No upgradeable packages found');
        const output = '⚠️  No packages can be safely upgraded at this time.';
        console.log(output);
        return this.createSuccessResult(output);
      }
      
      // Ask for confirmation unless --yes flag is provided
      if (!args.options.yes && !args.options.y) {
        spinner.stop();
        const shouldProceed = await this.confirmUpgrades(upgradeFixes);
        if (!shouldProceed) {
          const output = '❌ Upgrade operation cancelled by user.';
          console.log(output);
          return this.createSuccessResult(output);
        }
        spinner.start('Upgrading packages...');
      }
      
      spinner.text = 'Creating backup...';
      
      // Create scan context to get package manager adapter
      const context = await ScanContextFactory.createContext(args.projectPath);
      const autoFixer = new AutoFixer(args.projectPath, context.packageManager);
      
      spinner.text = 'Applying upgrades...';
      
      // Apply the upgrades
      const fixResult = await autoFixer.applyFixes(upgradeFixes);
      
      if (fixResult.success) {
        spinner.succeed(`Successfully upgraded ${fixResult.appliedFixes.length} packages!`);
        const output = this.formatUpgradeResults(fixResult);
        console.log(output);
        return this.createSuccessResult(output);
      } else {
        spinner.fail('Some upgrades failed to apply');
        const output = this.formatUpgradeErrors(fixResult);
        console.log(output);
        return this.createErrorResult(output);
      }
      
    } catch (error) {
      spinner.fail('Upgrade operation failed');
      return this.handleError(error, 'Dependency upgrade');
    }
  }

  /**
   * Asks user for confirmation before applying upgrades
   */
  private async confirmUpgrades(upgrades: any[]): Promise<boolean> {
    console.log('\n📦 PACKAGES TO BE UPGRADED:');
    console.log('='.repeat(40));
    
    upgrades.forEach((upgrade, index) => {
      const updateAction = upgrade.actions.find((a: any) => a.type === 'update');
      if (updateAction) {
        console.log(`${index + 1}. ${updateAction.packageName}`);
        console.log(`   ${updateAction.currentVersion} → ${updateAction.targetVersion}`);
        console.log(`   Risk: ${upgrade.risk.toUpperCase()}`);
        console.log('');
      }
    });
    
    console.log('⚠️  A backup will be created before applying upgrades.');
    console.log('💡 Use --yes flag to skip this confirmation in the future.');
    
    console.log('\n✅ Proceeding with upgrades (use Ctrl+C to cancel)...');
    
    // Add a small delay to allow user to cancel if needed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return true;
  }

  /**
   * Formats successful upgrade results
   */
  private formatUpgradeResults(result: any): string {
    const lines: string[] = [];
    
    lines.push('✅ UPGRADES APPLIED SUCCESSFULLY');
    lines.push('='.repeat(40));
    lines.push('');
    
    if (result.backup) {
      lines.push(`💾 Backup created: ${result.backup.backupPath}`);
      lines.push('');
    }
    
    lines.push(`📦 Upgraded ${result.appliedFixes.length} packages:`);
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
    lines.push('  • Run your test suite');
    lines.push('  • Run `depmender check` to verify all packages are healthy');
    
    return lines.join('\n');
  }

  /**
   * Formats upgrade error results
   */
  private formatUpgradeErrors(result: any): string {
    const lines: string[] = [];
    
    lines.push('❌ UPGRADES PARTIALLY FAILED');
    lines.push('='.repeat(35));
    lines.push('');
    
    if (result.appliedFixes.length > 0) {
      lines.push(`✅ Successfully upgraded ${result.appliedFixes.length} packages:`);
      result.appliedFixes.forEach((fix: any, index: number) => {
        lines.push(`  ${index + 1}. ${fix.description}`);
      });
      lines.push('');
    }
    
    if (result.errors.length > 0) {
      lines.push('❌ Failed upgrades:');
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
    lines.push('  • Try upgrading remaining packages manually');
    lines.push('  • Run `depmender report` for detailed analysis');
    
    return lines.join('\n');
  }
}
