import { BaseCommand } from './BaseCommand';
import { CommandArgs, CommandResult } from '../core/types';
import { DependencyAnalyzer } from '../core/DependencyAnalyzer';
import { HealthReporter } from '../reporters/HealthReporter';
import ora from 'ora';

/**
 * Report command implementation
 * Requirement 6.3: Execute `depguardian report` to generate detailed dependency reports
 */
export class ReportCommand extends BaseCommand {
  name = 'report';
  description = 'Generate detailed dependency health report';

  async execute(args: CommandArgs): Promise<CommandResult> {
    const spinner = ora('Generating dependency health report...').start();
    
    try {
      // Initialize components
      const analyzer = new DependencyAnalyzer();
      const healthReporter = new HealthReporter();
      
      // Show progress for long-running operations
      spinner.text = 'Analyzing project dependencies...';
      
      // Perform the analysis
      const analysis = await analyzer.analyze(args.projectPath);
      
      spinner.text = 'Generating comprehensive report...';
      
      // Generate the health report
      const healthReport = await healthReporter.generateReport(analysis);
      
      // Stop the spinner
      spinner.succeed('Report generated successfully!');
      
      // Format output based on options
      if (args.options.json) {
        const output = healthReporter.formatForJSON(healthReport);
        console.log(output);
        return this.createSuccessResult(output);
      }
      
      // Generate human-readable CLI output
      const output = healthReporter.formatForCLI(healthReport);
      console.log(output);
      
      // Add additional CLI-specific information
      this.displayAdditionalInfo(healthReport, args.options.verbose);
      
      return this.createSuccessResult(output);
      
    } catch (error) {
      spinner.fail('Report generation failed');
      return this.handleError(error, 'Report generation');
    }
  }

  /**
   * Displays additional information when verbose mode is enabled
   */
  private displayAdditionalInfo(report: any, verbose: boolean): void {
    if (!verbose) {
      return;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 VERBOSE REPORT DETAILS');
    console.log('='.repeat(60));
    
    // Show detailed issue breakdown
    if (report.summary) {
      console.log('\n📋 Detailed Summary:');
      console.log(`  Total packages analyzed: ${report.summary.totalPackages}`);
      console.log(`  Issues detected: ${report.summary.issuesFound}`);
      console.log(`  Critical issues: ${report.summary.criticalIssues}`);
      console.log(`  Security vulnerabilities: ${report.summary.securityVulnerabilities}`);
      console.log(`  Health score calculation: ${report.healthScore}/100`);
    }
    
    // Show recommendation details
    if (report.recommendations && report.recommendations.length > 0) {
      console.log('\n💡 Detailed Recommendations:');
      report.recommendations.forEach((rec: any, index: number) => {
        console.log(`  ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.description}`);
        if (rec.commands && rec.commands.length > 0) {
          console.log(`     Commands: ${rec.commands.join(' && ')}`);
        }
      });
    }
    
    // Show analysis metadata
    console.log('\n🔍 Analysis Metadata:');
    console.log(`  Report generated at: ${new Date().toISOString()}`);
    console.log(`  Analysis depth: Comprehensive`);
    console.log(`  Data sources: Package registries, vulnerability databases`);
    
    console.log('\n💡 Pro Tips:');
    console.log('  • Use `depguardian fix` to apply automated fixes');
    console.log('  • Run analysis regularly to maintain dependency health');
    console.log('  • Consider setting up CI/CD integration for continuous monitoring');
    console.log('  • Use `--json` flag for integration with other tools');
  }
}