import * as path from 'path';
import { CLICommand, CommandArgs, CommandResult } from '../core/types';
import { CLIFormatter } from '../utils/CLIFormatter';
import { errorHandler } from '../utils/ErrorHandler';
import { logger } from '../utils/Logger';

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
    const errorInfo = errorHandler.analyzeError(error, `${this.name} command`);
    const formattedError = errorHandler.formatError(errorInfo);
    
    console.error(formattedError);
    
    // Add recovery suggestions if the error is recoverable
    if (errorInfo.recoverable) {
      console.error('\n🔄 This error might be recoverable. Try the suggestions above.');
    }
    
    // Add general help information
    console.error('\n📚 For more help:');
    const helpOptions = [
      `Run ${CLIFormatter.command('depguardian help')} for general usage`,
      `Run ${CLIFormatter.command('depguardian troubleshooting')} for common issues`,
      `Use ${CLIFormatter.command('--verbose')} flag for detailed output`
    ];
    console.error(CLIFormatter.bulletList(helpOptions));
    
    return this.createErrorResult(formattedError);
  }

  /**
   * Provides helpful error suggestions based on error patterns
   * Enhanced with better formatting and more comprehensive suggestions
   * @deprecated Use ErrorHandler instead
   */
  private getSuggestions(errorMessage: string): string[] {
    // This method is kept for backward compatibility but is deprecated
    // The ErrorHandler provides more comprehensive error analysis
    return [];
  }
}