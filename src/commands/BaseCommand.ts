import * as path from 'path';
import { CLICommand, CommandArgs, CommandResult } from '../core/types';
import { CLIFormatter } from '../utils/CLIFormatter';

/**
 * Base CLI command class that provides common functionality
 */
export abstract class BaseCommand implements CLICommand {
  abstract name: string;
  abstract description: string;
  abstract execute(args: CommandArgs): Promise<CommandResult>;

  /**
   * Resolves the project path from command arguments
   */
  protected resolveProjectPath(providedPath?: string): string {
    if (providedPath) {
      return path.resolve(providedPath);
    }
    return process.cwd();
  }

  /**
   * Creates a successful command result
   */
  protected createSuccessResult(output: string): CommandResult {
    return {
      success: true,
      output,
      exitCode: 0
    };
  }

  /**
   * Creates an error command result
   */
  protected createErrorResult(error: string, exitCode: number = 1): CommandResult {
    return {
      success: false,
      output: error,
      exitCode
    };
  }

  /**
   * Handles errors consistently across commands with enhanced formatting
   * Requirement 6.6: Helpful error messages with suggested solutions
   */
  protected handleError(error: unknown, operation: string): CommandResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = CLIFormatter.error(`${operation} failed: ${errorMessage}`);
    
    console.error(fullMessage);
    
    // Provide helpful suggestions based on common error patterns
    const suggestions = this.getSuggestions(errorMessage);
    if (suggestions.length > 0) {
      console.error('\n💡 Suggestions:');
      console.error(CLIFormatter.bulletList(suggestions));
    }
    
    // Add general help information
    console.error('\n📚 For more help:');
    const helpOptions = [
      `Run ${CLIFormatter.command('depguardian help')} for general usage`,
      `Run ${CLIFormatter.command('depguardian troubleshooting')} for common issues`,
      `Use ${CLIFormatter.command('--verbose')} flag for detailed output`
    ];
    console.error(CLIFormatter.bulletList(helpOptions));
    
    return this.createErrorResult(fullMessage);
  }

  /**
   * Provides helpful error suggestions based on error patterns
   * Enhanced with better formatting and more comprehensive suggestions
   */
  private getSuggestions(errorMessage: string): string[] {
    const suggestions: string[] = [];
    
    if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
      suggestions.push('Make sure you are in a valid Node.js project directory');
      suggestions.push('Check that package.json exists in the current directory');
      suggestions.push('Verify the project path is correct if using --path option');
    }
    
    if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
      suggestions.push('Try running the command with appropriate permissions');
      suggestions.push('Check file and directory permissions');
      suggestions.push('Ensure you have write access to the project directory');
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('ENOTFOUND')) {
      suggestions.push('Check your internet connection');
      suggestions.push('Verify you can access npm registry (npmjs.com)');
      suggestions.push('Try again in a few moments');
      suggestions.push('Check if you are behind a corporate firewall');
    }
    
    if (errorMessage.includes('package.json')) {
      suggestions.push('Verify that package.json is valid JSON');
      suggestions.push('Make sure package.json contains required fields (name, version)');
      suggestions.push('Check for syntax errors in package.json');
    }
    
    if (errorMessage.includes('lockfile') || errorMessage.includes('lock')) {
      suggestions.push('Try deleting the lockfile and running npm/yarn/pnpm install');
      suggestions.push('Check if the lockfile is corrupted');
      suggestions.push('Ensure the lockfile matches your package manager');
    }
    
    if (errorMessage.includes('node_modules')) {
      suggestions.push('Try deleting node_modules and reinstalling dependencies');
      suggestions.push('Run npm/yarn/pnpm install to ensure dependencies are installed');
      suggestions.push('Check for disk space issues');
    }
    
    return suggestions;
  }
}