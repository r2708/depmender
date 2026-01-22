#!/usr/bin/env node

import { program } from 'commander';
import * as path from 'path';
import { CLICommand, CommandArgs, CommandResult } from './core/types';
import { ScanCommand } from './commands/ScanCommand';
import { ReportCommand } from './commands/ReportCommand';
import { FixCommand } from './commands/FixCommand';
import { HelpSystem } from './utils/HelpSystem';
import { CLIFormatter } from './utils/CLIFormatter';
import { logger, LogLevel } from './utils/Logger';

// Set up the main program with comprehensive help
program
  .name('depmender')
  .description('A CLI tool that scans JavaScript/TypeScript projects for dependency issues and fixes them')
  .version('1.0.0')
  .addHelpText('after', '\n' + HelpSystem.getMainHelp());

/**
 * Registers a command with the CLI program
 */
function registerCommand(command: CLICommand): void {
  const cmd = program
    .command(command.name)
    .description(command.description);

  // Add common options
  cmd.option('-p, --path <path>', 'project path to analyze', '.');
  cmd.option('--json', 'output results in JSON format');
  cmd.option('--verbose', 'enable verbose output');
  cmd.option('--quiet', 'suppress all logs except errors');
  
  // Add fix-specific options
  if (command.name === 'fix') {
    cmd.option('-y, --yes', 'automatically confirm all fixes without prompting');
  }

  // Add command-specific help
  cmd.addHelpText('after', '\n' + getCommandHelp(command.name));

  cmd.action(async (options) => {
    try {
      // Configure logging based on flags
      if (options.quiet) {
        logger.setQuiet(true);
      } else if (options.verbose) {
        logger.setVerbose(true);
        logger.info('Verbose logging enabled', 'CLI');
      } else {
        // Default: only show errors and warnings, no info logs
        logger.setLevel(LogLevel.ERROR);
      }

      const args: CommandArgs = {
        projectPath: path.resolve(options.path || '.'),
        options: {
          json: options.json || false,
          verbose: options.verbose || false,
          quiet: options.quiet || false,
          yes: options.yes || false,
          y: options.y || false,
          ...options
        }
      };

      logger.info(`Executing command: ${command.name}`, 'CLI', { 
        projectPath: args.projectPath,
        options: args.options 
      });

      const result = await command.execute(args);
      
      if (!result.success) {
        logger.error(`Command failed: ${command.name}`, undefined, 'CLI', { 
          exitCode: result.exitCode 
        });
        process.exit(result.exitCode);
      }

      logger.info(`Command completed successfully: ${command.name}`, 'CLI');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Unexpected error in command: ${command.name}`, error instanceof Error ? error : undefined, 'CLI');
      
      console.error(CLIFormatter.error(`Unexpected error: ${errorMessage}`));
      console.error('\n💡 Try running with --verbose for more details');
      console.error('💡 Use --help for usage information');
      
      // In verbose mode, show recent logs
      if (options.verbose) {
        console.error('\n📋 Recent logs:');
        const recentLogs = logger.getRecentLogs(10);
        recentLogs.forEach(log => {
          const timestamp = log.timestamp.toISOString().substring(11, 19);
          const level = LogLevel[log.level];
          const context = log.context ? `[${log.context}] ` : '';
          console.error(`  ${timestamp} ${level} ${context}${log.message}`);
        });
      }
      
      process.exit(1);
    }
  });
}

/**
 * Gets command-specific help text
 */
function getCommandHelp(commandName: string): string {
  switch (commandName) {
    case 'scan':
      return HelpSystem.getScanHelp();
    case 'report':
      return HelpSystem.getReportHelp();
    case 'fix':
      return HelpSystem.getFixHelp();
    default:
      return '';
  }
}

// Add additional help commands
program
  .command('help')
  .description('Show comprehensive help information')
  .argument('[command]', 'show help for specific command')
  .action((command) => {
    if (command) {
      switch (command) {
        case 'scan':
          console.log(HelpSystem.getScanHelp());
          break;
        case 'report':
          console.log(HelpSystem.getReportHelp());
          break;
        case 'fix':
          console.log(HelpSystem.getFixHelp());
          break;
        case 'examples':
          console.log(HelpSystem.getExamplesHelp());
          break;
        case 'troubleshooting':
          console.log(HelpSystem.getTroubleshootingHelp());
          break;
        default:
          console.log(CLIFormatter.error(`Unknown command: ${command}`));
          console.log('\nAvailable help topics: scan, report, fix, examples, troubleshooting');
      }
    } else {
      console.log(HelpSystem.getMainHelp());
    }
  });

program
  .command('examples')
  .description('Show usage examples and common workflows')
  .action(() => {
    console.log(HelpSystem.getExamplesHelp());
  });

program
  .command('troubleshooting')
  .description('Show troubleshooting guide')
  .action(() => {
    console.log(HelpSystem.getTroubleshootingHelp());
  });

// Register main commands
registerCommand(new ScanCommand());
registerCommand(new ReportCommand());
registerCommand(new FixCommand());

// Export the registration function for use by specific commands
export { registerCommand };

// Parse command line arguments
program.parse();