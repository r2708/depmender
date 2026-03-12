/**
 * Comprehensive error messages and recovery suggestions
 * Provides context-aware error messages with actionable solutions
 */

import { CLIFormatter } from './CLIFormatter';

export interface ErrorContext {
  command: string;
  operation: string;
  projectPath?: string;
  packageManager?: string;
}

export class ErrorMessages {
  /**
   * Gets a comprehensive error message with context and solutions
   */
  static getContextualError(error: Error, context: ErrorContext): string {
    const errorType = this.categorizeError(error.message);
    const solutions = this.getSolutions(errorType, error.message, context);

    const lines: string[] = [];

    // Error header
    lines.push(CLIFormatter.error(`❌ ${context.command} failed`));
    lines.push('');

    // Error details
    lines.push(`📋 Operation: ${context.operation}`);
    lines.push(`💬 Error: ${error.message}`);

    if (context.projectPath) {
      lines.push(`📁 Project: ${context.projectPath}`);
    }

    if (context.packageManager) {
      lines.push(`⚙️  Package Manager: ${context.packageManager}`);
    }

    lines.push('');

    // Solutions
    if (solutions.length > 0) {
      lines.push('💡 How to fix:');
      solutions.forEach((solution, index) => {
        lines.push(`   ${index + 1}. ${solution}`);
      });
      lines.push('');
    }

    // Quick commands
    const quickCommands = this.getQuickCommands(errorType, context);
    if (quickCommands.length > 0) {
      lines.push('⚡ Quick commands to try:');
      quickCommands.forEach(cmd => {
        lines.push(`   ${CLIFormatter.command(cmd)}`);
      });
      lines.push('');
    }

    // Additional help
    lines.push('📚 Need more help?');
    lines.push(`   • Run ${CLIFormatter.command('depmender help')} for general usage`);
    lines.push(`   • Run ${CLIFormatter.command('depmender troubleshooting')} for common issues`);
    lines.push(`   • Use ${CLIFormatter.command('--verbose')} flag for detailed output`);
    lines.push(`   • Check logs for more details`);

    return lines.join('\n');
  }

  /**
   * Categorizes error based on message patterns
   */
  private static categorizeError(message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes('enoent') || lower.includes('not found')) {
      return 'file_not_found';
    }
    if (lower.includes('eacces') || lower.includes('permission')) {
      return 'permission_denied';
    }
    if (lower.includes('enotfound') || lower.includes('network') || lower.includes('timeout')) {
      return 'network_error';
    }
    if (lower.includes('package.json')) {
      return 'package_json_error';
    }
    if (lower.includes('lockfile') || lower.includes('lock')) {
      return 'lockfile_error';
    }
    if (lower.includes('node_modules')) {
      return 'node_modules_error';
    }
    if (lower.includes('cache')) {
      return 'cache_error';
    }
    if (lower.includes('parse') || lower.includes('syntax') || lower.includes('json')) {
      return 'syntax_error';
    }
    if (lower.includes('space') || lower.includes('enospc')) {
      return 'disk_space_error';
    }

    return 'unknown_error';
  }

  /**
   * Gets solutions based on error type and context
   */
  private static getSolutions(errorType: string, message: string, context: ErrorContext): string[] {
    const solutions: string[] = [];

    switch (errorType) {
      case 'file_not_found':
        if (message.includes('package.json')) {
          solutions.push('Make sure you are in a Node.js project directory');
          solutions.push('Check if package.json exists in the current directory');
          solutions.push('Use --path option to specify the correct project location');
          solutions.push('Create package.json if missing: npm init -y');
        } else {
          solutions.push('Verify the file path is correct');
          solutions.push('Check if the file exists: ls -la');
          solutions.push('Ensure you have read permissions');
        }
        break;

      case 'permission_denied':
        solutions.push('Check file and directory permissions: ls -la');
        solutions.push('Ensure you own the project directory');
        if (process.platform !== 'win32') {
          solutions.push('Fix ownership: sudo chown -R $USER:$USER .');
          solutions.push('Avoid using sudo with npm commands');
        } else {
          solutions.push('Run terminal as Administrator if needed');
        }
        break;

      case 'network_error':
        solutions.push('Check your internet connection');
        solutions.push('Test npm registry access: npm ping');
        solutions.push('Check proxy settings: npm config get proxy');
        solutions.push('Try using a different network');
        if (message.includes('timeout')) {
          solutions.push('Increase timeout: npm config set fetch-timeout 60000');
        }
        break;

      case 'package_json_error':
        solutions.push('Validate JSON syntax: cat package.json | jq');
        solutions.push('Check for missing commas or quotes');
        solutions.push('Ensure required fields exist (name, version)');
        solutions.push('Backup and recreate if corrupted: npm init');
        break;

      case 'lockfile_error':
        solutions.push('Delete lockfile and reinstall:');
        solutions.push('  rm package-lock.json && npm install');
        solutions.push('Clear npm cache: npm cache clean --force');
        solutions.push('Check if lockfile matches package manager');
        break;

      case 'node_modules_error':
        solutions.push('Delete node_modules and reinstall:');
        solutions.push('  rm -rf node_modules && npm install');
        solutions.push('Clear npm cache: npm cache clean --force');
        solutions.push('Check available disk space: df -h');
        break;

      case 'cache_error':
        solutions.push('Clear npm cache: npm cache clean --force');
        solutions.push('Clear depmender cache: depmender cache clear');
        solutions.push('Try with --force flag');
        break;

      case 'syntax_error':
        solutions.push('Check JSON syntax in configuration files');
        solutions.push('Validate with: cat file.json | jq');
        solutions.push('Look for missing commas, quotes, or brackets');
        solutions.push('Use a JSON validator or editor with syntax highlighting');
        break;

      case 'disk_space_error':
        solutions.push('Check available disk space: df -h');
        solutions.push('Free up space by removing unnecessary files');
        solutions.push('Clear npm cache: npm cache clean --force');
        solutions.push(
          'Remove old node_modules: find . -name node_modules -type d -exec rm -rf {} +'
        );
        break;

      default:
        solutions.push('Try running the command again');
        solutions.push('Use --verbose flag for more details');
        solutions.push('Check the logs for additional information');
        solutions.push('Ensure all dependencies are properly installed');
        break;
    }

    return solutions;
  }

  /**
   * Gets quick command suggestions based on error type
   */
  private static getQuickCommands(errorType: string, context: ErrorContext): string[] {
    const commands: string[] = [];

    switch (errorType) {
      case 'file_not_found':
        if (context.command === 'check' || context.command === 'fix') {
          commands.push('ls -la package.json');
          commands.push('pwd');
        }
        break;

      case 'permission_denied':
        commands.push('ls -la');
        if (process.platform !== 'win32') {
          commands.push('sudo chown -R $USER:$USER .');
        }
        break;

      case 'network_error':
        commands.push('npm ping');
        commands.push('ping registry.npmjs.org');
        break;

      case 'package_json_error':
        commands.push('cat package.json | jq');
        commands.push('npm init -y');
        break;

      case 'lockfile_error':
        commands.push('rm package-lock.json && npm install');
        commands.push('npm cache clean --force');
        break;

      case 'node_modules_error':
        commands.push('rm -rf node_modules && npm install');
        commands.push('npm cache clean --force');
        break;

      case 'cache_error':
        commands.push('npm cache clean --force');
        commands.push('depmender cache clear');
        break;

      case 'disk_space_error':
        commands.push('df -h');
        commands.push('npm cache clean --force');
        break;
    }

    return commands;
  }

  /**
   * Gets recovery suggestions for specific commands
   */
  static getRecoverySuggestions(command: string): string[] {
    const suggestions: string[] = [];

    switch (command) {
      case 'check':
        suggestions.push('Ensure you are in a valid Node.js project');
        suggestions.push('Run npm install to install dependencies');
        suggestions.push('Try with --verbose for more details');
        break;

      case 'fix':
        suggestions.push('Run depmender check first to identify issues');
        suggestions.push('Ensure you have write permissions');
        suggestions.push('Create a backup before running fixes');
        break;

      case 'report':
        suggestions.push('Check if dependencies are installed');
        suggestions.push('Verify network connectivity');
        suggestions.push('Try with --json for machine-readable output');
        break;

      case 'upgrade':
        suggestions.push('Backup your project before upgrading');
        suggestions.push('Test thoroughly after upgrades');
        suggestions.push('Use --yes flag to skip confirmations');
        break;

      case 'init':
        suggestions.push('Ensure you have write permissions');
        suggestions.push('Use --force to overwrite existing config');
        break;
    }

    return suggestions;
  }
}
