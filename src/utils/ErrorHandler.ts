/**
 * Centralized error handling utility for Depguardian
 * Provides consistent error categorization, logging, and user-friendly messages
 */

import { logger } from './Logger';

export enum ErrorCategory {
  FILE_SYSTEM = 'filesystem',
  NETWORK = 'network',
  PACKAGE_MANAGER = 'package-manager',
  ANALYSIS = 'analysis',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  CONFIGURATION = 'configuration',
  UNKNOWN = 'unknown'
}

export interface ErrorInfo {
  category: ErrorCategory;
  code?: string;
  message: string;
  originalError: Error;
  suggestions: string[];
  recoverable: boolean;
}

export class ErrorHandler {
  private static instance: ErrorHandler;

  private constructor() {}

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Analyzes an error and returns structured error information
   */
  analyzeError(error: unknown, context?: string): ErrorInfo {
    const originalError = error instanceof Error ? error : new Error(String(error));
    const message = originalError.message;
    
    logger.error(`Error in ${context || 'unknown context'}`, originalError);

    // Categorize the error based on patterns
    const category = this.categorizeError(message);
    const code = this.extractErrorCode(message);
    const suggestions = this.generateSuggestions(category, message);
    const recoverable = this.isRecoverable(category, message);

    return {
      category,
      code,
      message,
      originalError,
      suggestions,
      recoverable
    };
  }

  /**
   * Categorizes an error based on its message and patterns
   */
  private categorizeError(message: string): ErrorCategory {
    const lowerMessage = message.toLowerCase();

    // File system errors (check before package manager errors)
    if (lowerMessage.includes('enoent') || 
        lowerMessage.includes('file not found') ||
        lowerMessage.includes('directory not found') ||
        lowerMessage.includes('no such file') ||
        lowerMessage.includes('not found')) {
      return ErrorCategory.FILE_SYSTEM;
    }

    // Permission errors
    if (lowerMessage.includes('eacces') || 
        lowerMessage.includes('permission denied') ||
        lowerMessage.includes('access denied') ||
        lowerMessage.includes('eperm')) {
      return ErrorCategory.PERMISSION;
    }

    // Network errors
    if (lowerMessage.includes('enotfound') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('network') ||
        lowerMessage.includes('connection') ||
        lowerMessage.includes('fetch failed') ||
        lowerMessage.includes('getaddrinfo')) {
      return ErrorCategory.NETWORK;
    }

    // Package manager errors (check after file system errors)
    if (lowerMessage.includes('package.json') ||
        lowerMessage.includes('lockfile') ||
        lowerMessage.includes('npm') ||
        lowerMessage.includes('yarn') ||
        lowerMessage.includes('pnpm')) {
      return ErrorCategory.PACKAGE_MANAGER;
    }

    // Analysis errors
    if (lowerMessage.includes('analysis') ||
        lowerMessage.includes('scan') ||
        lowerMessage.includes('dependency') ||
        lowerMessage.includes('vulnerability')) {
      return ErrorCategory.ANALYSIS;
    }

    // Validation errors
    if (lowerMessage.includes('invalid') ||
        lowerMessage.includes('malformed') ||
        lowerMessage.includes('corrupt') ||
        lowerMessage.includes('parse') ||
        lowerMessage.includes('syntax')) {
      return ErrorCategory.VALIDATION;
    }

    // Configuration errors
    if (lowerMessage.includes('config') ||
        lowerMessage.includes('setting') ||
        lowerMessage.includes('option')) {
      return ErrorCategory.CONFIGURATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Extracts error code from error message if present
   */
  private extractErrorCode(message: string): string | undefined {
    // Common Node.js error codes
    const codeMatch = message.match(/\b(E[A-Z]+)\b/);
    if (codeMatch) {
      return codeMatch[1];
    }

    // HTTP status codes
    const httpMatch = message.match(/\b([4-5]\d{2})\b/);
    if (httpMatch) {
      return `HTTP_${httpMatch[1]}`;
    }

    return undefined;
  }

  /**
   * Generates helpful suggestions based on error category and message
   */
  private generateSuggestions(category: ErrorCategory, message: string): string[] {
    const suggestions: string[] = [];

    switch (category) {
      case ErrorCategory.FILE_SYSTEM:
        suggestions.push('Verify you are in a valid Node.js project directory');
        suggestions.push('Check that package.json exists in the current directory');
        suggestions.push('Ensure the project path is correct if using --path option');
        if (message.includes('node_modules')) {
          suggestions.push('Try running npm/yarn/pnpm install to install dependencies');
        }
        break;

      case ErrorCategory.PERMISSION:
        suggestions.push('Try running the command with appropriate permissions');
        suggestions.push('Check file and directory permissions');
        suggestions.push('Ensure you have write access to the project directory');
        if (process.platform !== 'win32') {
          suggestions.push('Consider using sudo if necessary (use with caution)');
        }
        break;

      case ErrorCategory.NETWORK:
        suggestions.push('Check your internet connection');
        suggestions.push('Verify you can access npm registry (npmjs.com)');
        suggestions.push('Try again in a few moments');
        suggestions.push('Check if you are behind a corporate firewall');
        suggestions.push('Consider using a different network or VPN');
        break;

      case ErrorCategory.PACKAGE_MANAGER:
        if (message.includes('package.json')) {
          suggestions.push('Verify that package.json is valid JSON');
          suggestions.push('Check for syntax errors in package.json');
          suggestions.push('Ensure package.json contains required fields (name, version)');
        }
        if (message.includes('lockfile') || message.includes('lock')) {
          suggestions.push('Try deleting the lockfile and running npm/yarn/pnpm install');
          suggestions.push('Check if the lockfile is corrupted');
          suggestions.push('Ensure the lockfile matches your package manager');
        }
        if (message.includes('node_modules')) {
          suggestions.push('Try deleting node_modules and reinstalling dependencies');
          suggestions.push('Check for disk space issues');
        }
        break;

      case ErrorCategory.ANALYSIS:
        suggestions.push('Try running the analysis again');
        suggestions.push('Use --verbose flag for more detailed error information');
        suggestions.push('Check if all dependencies are properly installed');
        suggestions.push('Verify the project structure is valid');
        break;

      case ErrorCategory.VALIDATION:
        suggestions.push('Check for syntax errors in configuration files');
        suggestions.push('Verify all JSON files are properly formatted');
        suggestions.push('Ensure all required fields are present');
        break;

      case ErrorCategory.CONFIGURATION:
        suggestions.push('Check your configuration settings');
        suggestions.push('Verify all required options are provided');
        suggestions.push('Review the documentation for correct usage');
        break;

      case ErrorCategory.UNKNOWN:
        suggestions.push('Try running with --verbose for more details');
        suggestions.push('Check the documentation for similar issues');
        suggestions.push('Consider filing a bug report if the issue persists');
        break;
    }

    // Add general suggestions
    suggestions.push('Run `depguardian help` for general usage information');
    suggestions.push('Run `depguardian troubleshooting` for common issues');

    return suggestions;
  }

  /**
   * Determines if an error is recoverable
   */
  private isRecoverable(category: ErrorCategory, message: string): boolean {
    switch (category) {
      case ErrorCategory.NETWORK:
        return true; // Network issues are often temporary
      
      case ErrorCategory.FILE_SYSTEM:
        return !message.includes('ENOSPC'); // Out of space is not easily recoverable
      
      case ErrorCategory.PERMISSION:
        return true; // Permission issues can often be resolved
      
      case ErrorCategory.PACKAGE_MANAGER:
        return !message.includes('corrupt'); // Corruption might require manual intervention
      
      case ErrorCategory.ANALYSIS:
        return true; // Analysis errors are often recoverable
      
      case ErrorCategory.VALIDATION:
        return true; // Validation errors can be fixed
      
      case ErrorCategory.CONFIGURATION:
        return true; // Configuration errors can be corrected
      
      case ErrorCategory.UNKNOWN:
        return false; // Unknown errors are assumed non-recoverable
      
      default:
        return false;
    }
  }

  /**
   * Formats an error for display to the user
   */
  formatError(errorInfo: ErrorInfo): string {
    const lines: string[] = [];
    
    lines.push(`❌ ${errorInfo.message}`);
    
    if (errorInfo.code) {
      lines.push(`   Error Code: ${errorInfo.code}`);
    }
    
    lines.push(`   Category: ${errorInfo.category}`);
    
    if (errorInfo.suggestions.length > 0) {
      lines.push('');
      lines.push('💡 Suggestions:');
      errorInfo.suggestions.forEach(suggestion => {
        lines.push(`   • ${suggestion}`);
      });
    }
    
    return lines.join('\n');
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();