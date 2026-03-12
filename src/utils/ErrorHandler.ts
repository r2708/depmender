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
  UNKNOWN = 'unknown',
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
      recoverable,
    };
  }

  /**
   * Categorizes an error based on its message and patterns
   */
  private categorizeError(message: string): ErrorCategory {
    const lowerMessage = message.toLowerCase();

    // File system errors (check before package manager errors)
    if (
      lowerMessage.includes('enoent') ||
      lowerMessage.includes('file not found') ||
      lowerMessage.includes('directory not found') ||
      lowerMessage.includes('no such file') ||
      lowerMessage.includes('not found')
    ) {
      return ErrorCategory.FILE_SYSTEM;
    }

    // Permission errors
    if (
      lowerMessage.includes('eacces') ||
      lowerMessage.includes('permission denied') ||
      lowerMessage.includes('access denied') ||
      lowerMessage.includes('eperm')
    ) {
      return ErrorCategory.PERMISSION;
    }

    // Network errors
    if (
      lowerMessage.includes('enotfound') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('network') ||
      lowerMessage.includes('connection') ||
      lowerMessage.includes('fetch failed') ||
      lowerMessage.includes('getaddrinfo')
    ) {
      return ErrorCategory.NETWORK;
    }

    // Package manager errors (check after file system errors)
    if (
      lowerMessage.includes('package.json') ||
      lowerMessage.includes('lockfile') ||
      lowerMessage.includes('npm') ||
      lowerMessage.includes('yarn') ||
      lowerMessage.includes('pnpm')
    ) {
      return ErrorCategory.PACKAGE_MANAGER;
    }

    // Analysis errors
    if (
      lowerMessage.includes('analysis') ||
      lowerMessage.includes('scan') ||
      lowerMessage.includes('dependency') ||
      lowerMessage.includes('vulnerability')
    ) {
      return ErrorCategory.ANALYSIS;
    }

    // Validation errors
    if (
      lowerMessage.includes('invalid') ||
      lowerMessage.includes('malformed') ||
      lowerMessage.includes('corrupt') ||
      lowerMessage.includes('parse') ||
      lowerMessage.includes('syntax')
    ) {
      return ErrorCategory.VALIDATION;
    }

    // Configuration errors
    if (
      lowerMessage.includes('config') ||
      lowerMessage.includes('setting') ||
      lowerMessage.includes('option')
    ) {
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
        if (message.includes('package.json')) {
          suggestions.push('✓ Run this command in your project root directory');
          suggestions.push('✓ Verify package.json exists: ls -la package.json');
          suggestions.push('✓ Create package.json if missing: npm init -y');
        } else if (message.includes('node_modules')) {
          suggestions.push('✓ Install dependencies: npm install (or yarn/pnpm)');
          suggestions.push('✓ Check if package-lock.json exists');
          suggestions.push('✓ Verify disk space: df -h');
        } else {
          suggestions.push('✓ Verify you are in a valid Node.js project directory');
          suggestions.push('✓ Check the project path: pwd');
          suggestions.push('✓ Use --path option to specify project location');
        }
        break;

      case ErrorCategory.PERMISSION:
        suggestions.push('✓ Check file permissions: ls -la');
        suggestions.push('✓ Ensure you own the project directory');
        if (process.platform !== 'win32') {
          suggestions.push('✓ Fix permissions: sudo chown -R $USER:$USER .');
          suggestions.push('⚠️  Avoid using sudo with npm/yarn/pnpm');
        } else {
          suggestions.push('✓ Run terminal as Administrator if needed');
        }
        suggestions.push('✓ Check if files are locked by another process');
        break;

      case ErrorCategory.NETWORK:
        suggestions.push('✓ Check internet connection: ping registry.npmjs.org');
        suggestions.push('✓ Verify npm registry access: npm ping');
        suggestions.push('✓ Check proxy settings: npm config get proxy');
        suggestions.push('✓ Try using a different network or VPN');
        if (message.includes('timeout')) {
          suggestions.push('✓ Increase timeout: npm config set fetch-timeout 60000');
        }
        if (message.includes('ENOTFOUND')) {
          suggestions.push('✓ Check DNS settings');
          suggestions.push('✓ Try using Google DNS: 8.8.8.8');
        }
        break;

      case ErrorCategory.PACKAGE_MANAGER:
        if (message.includes('package.json')) {
          suggestions.push('✓ Validate JSON syntax: cat package.json | jq');
          suggestions.push('✓ Check required fields: name, version');
          suggestions.push('✓ Fix JSON errors using an editor with validation');
          suggestions.push('✓ Backup and recreate if corrupted: npm init');
        } else if (message.includes('lockfile') || message.includes('lock')) {
          suggestions.push('✓ Delete lockfile: rm package-lock.json (or yarn.lock/pnpm-lock.yaml)');
          suggestions.push('✓ Reinstall: npm install --force');
          suggestions.push('✓ Clear npm cache: npm cache clean --force');
          suggestions.push('✓ Verify package manager version: npm --version');
        } else if (message.includes('node_modules')) {
          suggestions.push('✓ Remove node_modules: rm -rf node_modules');
          suggestions.push('✓ Clear cache: npm cache clean --force');
          suggestions.push('✓ Reinstall: npm install');
          suggestions.push('✓ Check disk space: df -h');
        } else {
          suggestions.push('✓ Update package manager: npm install -g npm@latest');
          suggestions.push('✓ Clear cache: npm cache clean --force');
          suggestions.push('✓ Try with --force flag');
        }
        break;

      case ErrorCategory.ANALYSIS:
        suggestions.push('✓ Run with verbose mode: depmender check --verbose');
        suggestions.push('✓ Verify all dependencies installed: npm list');
        suggestions.push('✓ Check for missing packages: npm install');
        suggestions.push('✓ Clear depmender cache: depmender cache clear');
        suggestions.push('✓ Try analyzing again after fixing dependencies');
        break;

      case ErrorCategory.VALIDATION:
        suggestions.push('✓ Validate package.json: cat package.json | jq');
        suggestions.push('✓ Check for trailing commas in JSON');
        suggestions.push('✓ Verify quotes are properly closed');
        suggestions.push('✓ Use a JSON validator: jsonlint package.json');
        suggestions.push('✓ Check configuration file syntax');
        break;

      case ErrorCategory.CONFIGURATION:
        suggestions.push('✓ Check depmender config: cat depmender-files/depmender.config.js');
        suggestions.push('✓ Validate config syntax');
        suggestions.push('✓ Recreate config: depmender init --force');
        suggestions.push('✓ Review config documentation: depmender help');
        break;

      case ErrorCategory.UNKNOWN:
        suggestions.push('✓ Run with verbose logging: depmender check --verbose');
        suggestions.push('✓ Check recent logs for details');
        suggestions.push('✓ Clear cache and try again: depmender cache clear');
        suggestions.push('✓ Update depmender: npm update -g depmender');
        suggestions.push('✓ Report issue: https://github.com/r2708/depmender/issues');
        break;
    }

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

    lines.push(`❌ Error: ${errorInfo.message}`);
    lines.push('');

    if (errorInfo.code) {
      lines.push(`📋 Error Code: ${errorInfo.code}`);
    }

    lines.push(`📂 Category: ${this.getCategoryDisplayName(errorInfo.category)}`);

    if (!errorInfo.recoverable) {
      lines.push('⚠️  This error may require manual intervention');
    }

    if (errorInfo.suggestions.length > 0) {
      lines.push('');
      lines.push('💡 How to fix:');
      const topSuggestions = errorInfo.suggestions.slice(0, 5); // Show top 5
      topSuggestions.forEach((suggestion, index) => {
        lines.push(`   ${index + 1}. ${suggestion}`);
      });

      if (errorInfo.suggestions.length > 5) {
        lines.push(`   ... and ${errorInfo.suggestions.length - 5} more suggestions`);
      }
    }

    // Add quick fix command if available
    const quickFix = this.getQuickFixCommand(errorInfo);
    if (quickFix) {
      lines.push('');
      lines.push('⚡ Quick fix:');
      lines.push(`   ${quickFix}`);
    }

    return lines.join('\n');
  }

  /**
   * Gets a user-friendly category display name
   */
  private getCategoryDisplayName(category: ErrorCategory): string {
    const displayNames: Record<ErrorCategory, string> = {
      [ErrorCategory.FILE_SYSTEM]: 'File System',
      [ErrorCategory.NETWORK]: 'Network',
      [ErrorCategory.PACKAGE_MANAGER]: 'Package Manager',
      [ErrorCategory.ANALYSIS]: 'Analysis',
      [ErrorCategory.VALIDATION]: 'Validation',
      [ErrorCategory.PERMISSION]: 'Permission',
      [ErrorCategory.CONFIGURATION]: 'Configuration',
      [ErrorCategory.UNKNOWN]: 'Unknown',
    };
    return displayNames[category] || category;
  }

  /**
   * Gets a quick fix command for common errors
   */
  private getQuickFixCommand(errorInfo: ErrorInfo): string | null {
    const message = errorInfo.message.toLowerCase();

    if (errorInfo.category === ErrorCategory.FILE_SYSTEM) {
      if (message.includes('package.json')) {
        return 'npm init -y';
      }
      if (message.includes('node_modules')) {
        return 'npm install';
      }
    }

    if (errorInfo.category === ErrorCategory.PACKAGE_MANAGER) {
      if (message.includes('lockfile')) {
        return 'rm package-lock.json && npm install';
      }
      if (message.includes('cache')) {
        return 'npm cache clean --force && npm install';
      }
    }

    if (errorInfo.category === ErrorCategory.NETWORK) {
      return 'npm ping';
    }

    if (errorInfo.category === ErrorCategory.ANALYSIS) {
      return 'depmender cache clear && depmender check --verbose';
    }

    return null;
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();
