#!/usr/bin/env node

import { program } from 'commander';
import * as path from 'path';
import { CLICommand, CommandArgs } from './core/types';
import { ScanCommand } from './commands/ScanCommand';
import { ReportCommand } from './commands/ReportCommand';
import { FixCommand } from './commands/FixCommand';
import { DoctorCommand } from './commands/DoctorCommand';
import { CleanCommand } from './commands/CleanCommand';
import { WatchCommand } from './commands/WatchCommand';
import { InitCommand } from './commands/InitCommand';
import { HelpSystem } from './utils/HelpSystem';
import { CLIFormatter } from './utils/CLIFormatter';
import { logger, LogLevel } from './utils/Logger';

// Set up the main program with comprehensive help
program
  .name('depmender')
  .description('A CLI tool that scans JavaScript/TypeScript projects for dependency issues and fixes them')
  .version('1.1.0')
  .addHelpText('after', '\n' + HelpSystem.getMainHelp());

/**
 * Optimized command registration with streamlined option handling
 */
function registerCommand(command: CLICommand): void {
  const cmd = program
    .command(command.name)
    .description(command.description);

  // Add common options efficiently
  cmd.option('-p, --path <path>', 'project path to analyze', '.')
     .option('--json', 'output results in JSON format')
     .option('--verbose', 'enable verbose output')
     .option('--quiet', 'suppress all logs except errors');
  
  // Add fix-specific options conditionally
  if (command.name === 'fix') {
    cmd.option('-y, --yes', 'automatically confirm all fixes without prompting');
  }

  // Add clean-specific options
  if (command.name === 'clean') {
    cmd.option('--dry-run', 'show what would be removed without actually removing (default)')
       .option('--confirm', 'actually remove the unused packages');
  }

  // Add watch-specific options
  if (command.name === 'watch') {
    cmd.option('--notify', 'enable desktop notifications')
       .option('--webhook <url>', 'send results to webhook URL')
       .option('--interval <time>', 'scan interval (e.g., 30s, 2m)', '5s')
       .option('--auto-fix', 'automatically fix issues when found');
  }

  // Add init-specific options
  if (command.name === 'init') {
    cmd.option('--force', 'overwrite existing configuration file');
  }

  // Add command-specific help
  cmd.addHelpText('after', '\n' + getCommandHelp(command.name));

  cmd.action(async (options) => {
    try {
      // Optimized logging configuration
      configureLogging(options);

      const args: CommandArgs = {
        projectPath: path.resolve(options.path || '.'),
        options: {
          json: !!options.json,
          verbose: !!options.verbose,
          quiet: !!options.quiet,
          yes: !!(options.yes || options.y),
          y: !!options.y,
          path: options.path || '.',
          // Clean command options
          dryRun: options.dryRun !== false, // Default to true
          confirm: !!options.confirm,
          // Watch command options
          notify: !!options.notify,
          webhook: options.webhook,
          interval: options.interval,
          autoFix: !!options.autoFix,
          // Init command options
          force: !!options.force
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
      handleCommandError(error, command.name, options.verbose);
    }
  });
}

/**
 * Optimized logging configuration
 */
function configureLogging(options: any): void {
  if (options.quiet) {
    logger.setQuiet(true);
  } else if (options.verbose) {
    logger.setVerbose(true);
    logger.info('Verbose logging enabled', 'CLI');
  } else {
    // Default: only show errors and warnings, no info logs
    logger.setLevel(LogLevel.ERROR);
  }
}

/**
 * Centralized error handling
 */
function handleCommandError(error: unknown, commandName: string, verbose: boolean): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Unexpected error in command: ${commandName}`, error instanceof Error ? error : undefined, 'CLI');
  
  console.error(CLIFormatter.error(`Unexpected error: ${errorMessage}`));
  console.error('\n💡 Try running with --verbose for more details');
  console.error('💡 Use --help for usage information');
  
  // In verbose mode, show recent logs
  if (verbose) {
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

/**
 * Optimized command help lookup
 */
const HELP_COMMANDS: Record<string, () => string> = {
  scan: () => HelpSystem.getScanHelp(),
  report: () => HelpSystem.getReportHelp(),
  fix: () => HelpSystem.getFixHelp(),
  doctor: () => 'DOCTOR COMMAND\n  Run comprehensive system health diagnostics.\n  Checks Node.js environment, project structure, dependencies, and more.',
  clean: () => 'CLEAN COMMAND\n  Find and remove unused dependencies.\n  Use --dry-run to preview or --confirm to actually remove packages.',
  watch: () => 'WATCH COMMAND\n  Monitor project files and run dependency checks automatically.\n  Supports notifications, webhooks, and auto-fixing.',
  init: () => 'INIT COMMAND\n  Initialize depmender configuration file.\n  Creates a sample config file with all available options.',
  examples: () => HelpSystem.getExamplesHelp(),
  troubleshooting: () => HelpSystem.getTroubleshootingHelp()
};

/**
 * Gets command-specific help text efficiently
 */
function getCommandHelp(commandName: string): string {
  return HELP_COMMANDS[commandName]?.() || '';
}

// Add additional help commands with optimized handling
program
  .command('help')
  .description('Show comprehensive help information')
  .argument('[command]', 'show help for specific command')
  .action((command) => {
    if (command) {
      const helpFunction = HELP_COMMANDS[command];
      if (helpFunction) {
        console.log(helpFunction());
      } else {
        console.log(CLIFormatter.error(`Unknown command: ${command}`));
        console.log('\nAvailable help topics:', Object.keys(HELP_COMMANDS).join(', '));
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
registerCommand(new DoctorCommand());
registerCommand(new CleanCommand());
registerCommand(new WatchCommand());
registerCommand(new InitCommand());

// Export the registration function for use by specific commands
export { registerCommand };

// Parse command line arguments
program.parse();