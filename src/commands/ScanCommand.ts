import { BaseCommand } from './BaseCommand';
import { CommandArgs, CommandResult } from '../core/types';
import { DependencyAnalyzer } from '../core/DependencyAnalyzer';
import { CLIFormatter } from '../utils/CLIFormatter';
import { ProgressIndicator } from '../utils/ProgressIndicator';
import { logger } from '../utils/Logger';

/**
 * Scan command implementation
 * Requirement 6.1: Execute `depmender scan` to analyze project dependencies
 */
export class ScanCommand extends BaseCommand {
  name = 'scan';
  description = 'Analyze project dependencies and identify issues';
  private logger = logger.child('ScanCommand');

  async execute(args: CommandArgs): Promise<CommandResult> {
    this.logger.info('Starting scan command execution');
    
    const progress = new ProgressIndicator('Initializing dependency analysis...');
    progress.start();
    
    try {
      // Initialize the dependency analyzer
      this.logger.debug('Initializing dependency analyzer');
      const analyzer = new DependencyAnalyzer();
      
      // Show progress for long-running operations
      progress.updateText('Reading project structure...');
      
      // Perform the analysis
      this.logger.info(`Analyzing project at: ${args.projectPath}`);
      const analysis = await analyzer.analyze(args.projectPath);
      
      progress.updateText('Calculating health score...');
      
      // Stop the progress indicator
      progress.succeed('Analysis complete!');
      
      this.logger.info(`Analysis completed with health score: ${analysis.healthScore}`);
      
      // Format output based on options
      if (args.options.json) {
        const output = JSON.stringify(analysis, null, 2);
        console.log(output);
        return this.createSuccessResult(output);
      }
      
      // Create human-readable output with enhanced formatting
      const output = this.formatAnalysisOutput(analysis);
      console.log(output);
      
      return this.createSuccessResult(output);
      
    } catch (error) {
      progress.fail('Analysis failed');
      this.logger.error('Scan command failed', error instanceof Error ? error : undefined);
      return this.handleError(error, 'Dependency analysis');
    }
  }

  /**
   * Formats analysis results for human-readable output with enhanced formatting
   */
  private formatAnalysisOutput(analysis: any): string {
    const lines: string[] = [];
    
    // Header with enhanced formatting
    lines.push(CLIFormatter.header('🔍 DEPENDENCY SCAN RESULTS'));
    lines.push('');
    
    // Project info with better formatting
    lines.push(`📦 Project: ${CLIFormatter.packageInfo(analysis.projectInfo.name, analysis.projectInfo.version)}`);
    lines.push(`📁 Path: ${CLIFormatter.path(analysis.projectInfo.path)}`);
    lines.push(`⚙️  Package Manager: ${analysis.packageManager}`);
    lines.push('');
    
    // Health score with enhanced visual indicator
    lines.push(`🏥 Health Score: ${CLIFormatter.healthScore(analysis.healthScore)}`);
    lines.push('');
    
    // Issues summary with color coding
    lines.push(`📊 Issues Found: ${CLIFormatter.issueCount(analysis.issues.length, 'issues')}`);
    if (analysis.securityVulnerabilities.length > 0) {
      lines.push(`🔒 Security Vulnerabilities: ${CLIFormatter.issueCount(analysis.securityVulnerabilities.length, 'vulnerabilities')}`);
    }
    lines.push('');
    
    // Issue breakdown by type with enhanced formatting
    if (analysis.issues.length > 0) {
      lines.push(CLIFormatter.sectionHeader('📋 Issue Breakdown'));
      const issuesByType = this.groupIssuesByType(analysis.issues);
      
      for (const [type, issues] of Object.entries(issuesByType)) {
        if (issues.length > 0) {
          const typeIcon = this.getIssueTypeIcon(type);
          const formattedType = this.formatIssueType(type);
          lines.push(`  ${typeIcon} ${formattedType}: ${CLIFormatter.issueCount(issues.length, '')}`);
        }
      }
      lines.push('');
    }
    
    // Critical issues warning with enhanced formatting
    const criticalIssues = analysis.issues.filter((issue: any) => issue.severity === 'critical');
    const criticalSecurity = analysis.securityVulnerabilities.filter((vuln: any) => vuln.severity === 'critical');
    
    if (criticalIssues.length > 0 || criticalSecurity.length > 0) {
      lines.push(CLIFormatter.critical('CRITICAL ISSUES DETECTED!'));
      lines.push(`   Run ${CLIFormatter.command('depmender report')} for detailed information`);
      lines.push(`   Run ${CLIFormatter.command('depmender fix')} to apply automated fixes`);
      lines.push('');
    }
    
    // Available commands with descriptions
    lines.push(CLIFormatter.sectionHeader('🛠️  Available Commands'));
    const commands = [
      `${CLIFormatter.command('depmender report')} - Generate detailed health report with issue breakdown`,
      `${CLIFormatter.command('depmender fix')} - Apply automated fixes for detected issues`,
      `${CLIFormatter.command('depmender help')} - Show comprehensive help and usage information`,
      `${CLIFormatter.command('depmender examples')} - View usage examples and common workflows`,
      `${CLIFormatter.command('depmender troubleshooting')} - Get help with common problems`
    ];
    lines.push(CLIFormatter.bulletList(commands));
    lines.push('');
    
    // Next steps with enhanced formatting
    lines.push(CLIFormatter.sectionHeader('💡 Next Steps'));
    const nextSteps = [
      `Run ${CLIFormatter.command('depmender report')} for detailed analysis`,
      `Run ${CLIFormatter.command('depmender fix')} to apply automated fixes`,
      `Use ${CLIFormatter.command('--json')} flag for machine-readable output`
    ];
    lines.push(CLIFormatter.bulletList(nextSteps));
    
    return lines.join('\n');
  }

  /**
   * Gets health indicator emoji/text based on score
   */
  private getHealthIndicator(score: number): string {
    if (score >= 90) return '🟢 Excellent';
    if (score >= 75) return '🟡 Good';
    if (score >= 50) return '🟠 Fair';
    if (score >= 25) return '🔴 Poor';
    return '💀 Critical';
  }

  /**
   * Groups issues by type for summary display
   */
  private groupIssuesByType(issues: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    for (const issue of issues) {
      if (!grouped[issue.type]) {
        grouped[issue.type] = [];
      }
      grouped[issue.type].push(issue);
    }
    
    return grouped;
  }

  /**
   * Gets icon for issue type
   */
  private getIssueTypeIcon(type: string): string {
    switch (type) {
      case 'outdated': return '📅';
      case 'missing': return '❓';
      case 'broken': return '💥';
      case 'peer-conflict': return '🔗';
      case 'version-mismatch': return '⚠️';
      case 'security': return '🔒';
      default: return '❓';
    }
  }

  /**
   * Formats issue type for display
   */
  private formatIssueType(type: string): string {
    switch (type) {
      case 'outdated': return 'Outdated packages';
      case 'missing': return 'Missing packages';
      case 'broken': return 'Broken installations';
      case 'peer-conflict': return 'Peer conflicts';
      case 'version-mismatch': return 'Version mismatches';
      case 'security': return 'Security issues';
      default: return type;
    }
  }
}