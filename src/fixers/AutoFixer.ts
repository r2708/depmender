import * as fs from 'fs-extra';
import * as path from 'path';
import {
  AutoFixer as IAutoFixer,
  AnalysisResult,
  FixSuggestion,
  FixResult,
  BackupInfo,
  PackageManagerAdapter,
  FixType,
  RiskLevel,
  FixAction,
  PackageManagerType
} from '../core/types';
import { SuggestionEngine } from './SuggestionEngine';

/**
 * AutoFixer class that provides automated dependency fixing capabilities
 * with backup functionality to ensure safe modifications
 */
export class AutoFixer implements IAutoFixer {
  private suggestionEngine: SuggestionEngine;
  private projectPath: string;
  private packageManagerAdapter: PackageManagerAdapter;

  constructor(projectPath: string, packageManagerAdapter: PackageManagerAdapter) {
    this.projectPath = projectPath;
    this.packageManagerAdapter = packageManagerAdapter;
    this.suggestionEngine = new SuggestionEngine();
  }

  /**
   * Generates fix suggestions for all detected issues in the analysis
   * Requirement 4.1: One-click fix command for common dependency issues
   */
  async generateFixes(analysis: AnalysisResult): Promise<FixSuggestion[]> {
    // Use the suggestion engine to generate comprehensive fix suggestions
    const suggestions = await this.suggestionEngine.generateSuggestions(analysis);
    
    // Filter to only include fixable suggestions with concrete actions
    return suggestions.filter(suggestion => 
      suggestion.actions.length > 0 && 
      this.isFixable(suggestion)
    );
  }

  /**
   * Applies a list of fix suggestions with backup creation
   * Requirement 4.5: Create backup before modifications
   */
  async applyFixes(fixes: FixSuggestion[]): Promise<FixResult> {
    const result: FixResult = {
      success: false,
      appliedFixes: [],
      errors: []
    };

    if (fixes.length === 0) {
      result.success = true;
      return result;
    }

    try {
      // Create backup before making any modifications
      result.backup = await this.createBackup(this.projectPath);
      
      // Apply fixes sequentially to avoid conflicts
      for (const fix of fixes) {
        try {
          await this.applySingleFix(fix);
          result.appliedFixes.push(fix);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`Failed to apply fix "${fix.description}": ${errorMessage}`);
          
          // For critical errors, stop processing and restore backup
          if (fix.risk === RiskLevel.CRITICAL || this.isCriticalError(error)) {
            if (result.backup) {
              try {
                await this.restoreBackup(result.backup);
                result.errors.push('Backup restored due to critical error');
              } catch (restoreError) {
                const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
                result.errors.push(`Failed to restore backup: ${restoreMessage}`);
              }
            }
            break;
          }
        }
      }

      // Consider the operation successful if at least one fix was applied
      // and no critical errors occurred
      result.success = result.appliedFixes.length > 0 && 
                      !result.errors.some(error => error.includes('critical error'));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to apply fixes: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Creates a backup of the original package.json before making changes
   * Requirement 4.5: Backup creation before modifications
   */
  async createBackup(projectPath: string): Promise<BackupInfo> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const timestamp = new Date();
    const timestampStr = timestamp.toISOString().replace(/[:.]/g, '-');
    const backupFileName = `package.json.backup.${timestampStr}`;
    const backupPath = path.join(projectPath, backupFileName);

    try {
      // Ensure the original package.json exists
      if (!(await fs.pathExists(packageJsonPath))) {
        throw new Error(`package.json not found at ${packageJsonPath}`);
      }

      // Copy package.json to backup location
      await fs.copy(packageJsonPath, backupPath);

      // Verify backup was created successfully
      if (!(await fs.pathExists(backupPath))) {
        throw new Error(`Failed to create backup at ${backupPath}`);
      }

      return {
        originalPath: packageJsonPath,
        backupPath: backupPath,
        timestamp: timestamp
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create backup: ${errorMessage}`);
    }
  }

  /**
   * Restores the original package.json from backup
   */
  async restoreBackup(backupInfo: BackupInfo): Promise<void> {
    try {
      // Verify backup file exists
      if (!(await fs.pathExists(backupInfo.backupPath))) {
        throw new Error(`Backup file not found at ${backupInfo.backupPath}`);
      }

      // Restore the original file
      await fs.copy(backupInfo.backupPath, backupInfo.originalPath);

      // Verify restoration was successful
      if (!(await fs.pathExists(backupInfo.originalPath))) {
        throw new Error(`Failed to restore ${backupInfo.originalPath}`);
      }

      // Clean up backup file
      await fs.remove(backupInfo.backupPath);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to restore backup: ${errorMessage}`);
    }
  }

  /**
   * Applies a single fix suggestion
   */
  private async applySingleFix(fix: FixSuggestion): Promise<void> {
    for (const action of fix.actions) {
      await this.applyFixAction(action);
    }
  }

  /**
   * Applies a single fix action
   */
  private async applyFixAction(action: FixAction): Promise<void> {
    switch (action.type) {
      case 'install':
        if (!action.packageName) {
          throw new Error('Package name is required for install action');
        }
        await this.packageManagerAdapter.installPackage(action.packageName, action.version);
        break;

      case 'update':
        if (!action.packageName || !action.version) {
          throw new Error('Package name and version are required for update action');
        }
        await this.packageManagerAdapter.updatePackage(action.packageName, action.version);
        break;

      case 'remove':
        if (!action.packageName) {
          throw new Error('Package name is required for remove action');
        }
        await this.removePackage(action.packageName);
        break;

      case 'regenerate-lockfile':
        await this.packageManagerAdapter.regenerateLockfile();
        break;

      default:
        throw new Error(`Unknown fix action type: ${action.type}`);
    }
  }

  /**
   * Removes a package using the appropriate package manager
   */
  private async removePackage(packageName: string): Promise<void> {
    // This is a simplified implementation - in a real scenario,
    // we would need to execute the appropriate package manager command
    const packageManagerType = this.packageManagerAdapter.getType();
    
    switch (packageManagerType) {
      case PackageManagerType.NPM:
        // In a real implementation, we would execute: npm uninstall packageName
        throw new Error('Package removal not yet implemented for npm');
      case PackageManagerType.YARN:
        // In a real implementation, we would execute: yarn remove packageName
        throw new Error('Package removal not yet implemented for yarn');
      case PackageManagerType.PNPM:
        // In a real implementation, we would execute: pnpm remove packageName
        throw new Error('Package removal not yet implemented for pnpm');
      default:
        throw new Error(`Unsupported package manager: ${packageManagerType}`);
    }
  }

  /**
   * Determines if a fix suggestion is actually fixable
   */
  private isFixable(suggestion: FixSuggestion): boolean {
    // A fix is considered fixable if:
    // 1. It has concrete actions that can be executed
    // 2. It's not just a recommendation without actionable steps
    // 3. The risk level is not critical (unless it's a security fix)
    
    if (suggestion.actions.length === 0) {
      return false;
    }

    // Check if all actions have the required parameters
    for (const action of suggestion.actions) {
      switch (action.type) {
        case 'install':
        case 'update':
        case 'remove':
          if (!action.packageName) {
            return false;
          }
          break;
        case 'regenerate-lockfile':
          // No additional parameters required
          break;
        default:
          // Unknown action type is not fixable
          return false;
      }
    }

    // Critical risk fixes should only be applied if they're security-related
    if (suggestion.risk === RiskLevel.CRITICAL) {
      return this.isSecurityFix(suggestion);
    }

    return true;
  }

  /**
   * Determines if a suggestion is a security fix
   */
  private isSecurityFix(suggestion: FixSuggestion): boolean {
    const securityKeywords = ['security', 'vulnerability', 'CVE', 'exploit', 'malicious'];
    return securityKeywords.some(keyword => 
      suggestion.description.toLowerCase().includes(keyword.toLowerCase()) ||
      suggestion.estimatedImpact.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Determines if an error is critical and should stop the fixing process
   */
  private isCriticalError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const criticalErrorPatterns = [
      'EACCES', // Permission denied
      'ENOSPC', // No space left on device
      'EMFILE', // Too many open files
      'package.json.*corrupt',
      'lockfile.*corrupt',
      'network.*timeout'
    ];

    return criticalErrorPatterns.some(pattern => 
      error.message.match(new RegExp(pattern, 'i'))
    );
  }
}