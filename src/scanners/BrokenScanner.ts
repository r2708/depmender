import * as fs from 'fs-extra';
import * as path from 'path';
import { BaseDependencyScanner } from './BaseDependencyScanner';
import { 
  ScanContext, 
  ScanResult, 
  ScannerType, 
  DependencyIssue, 
  IssueType, 
  IssueSeverity 
} from '../core/types';

/**
 * Scanner that detects corrupted or incomplete installations
 * Checks for missing files and corrupted package structures
 */
export class BrokenScanner extends BaseDependencyScanner {

  getScannerType(): ScannerType {
    return ScannerType.BROKEN;
  }

  async scan(context: ScanContext): Promise<ScanResult> {
    this.validateContext(context);
    
    const result = this.createBaseScanResult();
    
    // Check all installed packages for corruption
    for (const installedPackage of context.nodeModules.packages) {
      const issues = await this.checkPackageIntegrity(installedPackage, context);
      result.issues.push(...issues);
    }
    
    return result;
  }

  /**
   * Checks the integrity of an installed package
   */
  private async checkPackageIntegrity(
    installedPackage: any,
    context: ScanContext
  ): Promise<DependencyIssue[]> {
    const issues: DependencyIssue[] = [];
    
    try {
      // Check if package directory exists
      const packageExists = await this.checkPackageDirectoryExists(installedPackage);
      if (!packageExists) {
        issues.push(this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.MISSING_DIRECTORY,
          'Package directory is missing from node_modules'
        ));
        return issues; // No point checking further if directory doesn't exist
      }

      // Check package.json integrity
      const packageJsonIssue = await this.checkPackageJsonIntegrity(installedPackage);
      if (packageJsonIssue) {
        issues.push(packageJsonIssue);
      }

      // Check main entry point
      const entryPointIssue = await this.checkEntryPointIntegrity(installedPackage);
      if (entryPointIssue) {
        issues.push(entryPointIssue);
      }

      // Check for essential files
      const essentialFilesIssues = await this.checkEssentialFiles(installedPackage);
      issues.push(...essentialFilesIssues);

      // Check for corrupted node_modules within the package
      const nestedModulesIssue = await this.checkNestedNodeModules(installedPackage);
      if (nestedModulesIssue) {
        issues.push(nestedModulesIssue);
      }

      // Check file permissions (if applicable)
      const permissionIssues = await this.checkFilePermissions(installedPackage);
      issues.push(...permissionIssues);

    } catch (error) {
      // If we can't check the package at all, it's definitely broken
      issues.push(this.createBrokenIssue(
        installedPackage.name,
        installedPackage.version,
        BrokenType.ACCESS_ERROR,
        `Cannot access package: ${error}`
      ));
    }

    return issues;
  }

  /**
   * Checks if the package directory exists
   */
  private async checkPackageDirectoryExists(installedPackage: any): Promise<boolean> {
    try {
      const stats = await fs.stat(installedPackage.path);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks the integrity of the package's package.json file
   */
  private async checkPackageJsonIntegrity(installedPackage: any): Promise<DependencyIssue | null> {
    const packageJsonPath = path.join(installedPackage.path, 'package.json');
    
    try {
      // Check if package.json exists
      if (!await fs.pathExists(packageJsonPath)) {
        return this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.MISSING_PACKAGE_JSON,
          'package.json file is missing'
        );
      }

      // Try to parse package.json
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
      const parsedPackageJson = JSON.parse(packageJsonContent);

      // Validate essential fields
      if (!parsedPackageJson.name) {
        return this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.INVALID_PACKAGE_JSON,
          'package.json is missing required "name" field'
        );
      }

      if (!parsedPackageJson.version) {
        return this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.INVALID_PACKAGE_JSON,
          'package.json is missing required "version" field'
        );
      }

      // Check if name matches expected
      if (parsedPackageJson.name !== installedPackage.name) {
        return this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.NAME_MISMATCH,
          `package.json name "${parsedPackageJson.name}" doesn't match expected "${installedPackage.name}"`
        );
      }

      return null; // Package.json is valid

    } catch (error) {
      if (error instanceof SyntaxError) {
        return this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.CORRUPTED_PACKAGE_JSON,
          'package.json contains invalid JSON'
        );
      }

      return this.createBrokenIssue(
        installedPackage.name,
        installedPackage.version,
        BrokenType.ACCESS_ERROR,
        `Cannot read package.json: ${error}`
      );
    }
  }

  /**
   * Checks if the main entry point file exists and is accessible
   */
  private async checkEntryPointIntegrity(installedPackage: any): Promise<DependencyIssue | null> {
    try {
      const packageJsonPath = path.join(installedPackage.path, 'package.json');
      
      if (!await fs.pathExists(packageJsonPath)) {
        return null; // Already handled by package.json check
      }

      const packageJson = await fs.readJson(packageJsonPath);
      const mainEntry = packageJson.main || 'index.js';
      const entryPointPath = path.join(installedPackage.path, mainEntry);

      // Check if main entry point exists
      if (!await fs.pathExists(entryPointPath)) {
        return this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.MISSING_ENTRY_POINT,
          `Main entry point "${mainEntry}" is missing`
        );
      }

      // Check if it's a file (not a directory)
      const stats = await fs.stat(entryPointPath);
      if (!stats.isFile()) {
        return this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.INVALID_ENTRY_POINT,
          `Main entry point "${mainEntry}" is not a file`
        );
      }

      return null; // Entry point is valid

    } catch (error) {
      return this.createBrokenIssue(
        installedPackage.name,
        installedPackage.version,
        BrokenType.ACCESS_ERROR,
        `Cannot check entry point: ${error}`
      );
    }
  }

  /**
   * Checks for essential files that should be present in most packages
   */
  private async checkEssentialFiles(installedPackage: any): Promise<DependencyIssue[]> {
    const issues: DependencyIssue[] = [];
    
    try {
      // Check for common essential files (these are warnings, not critical errors)
      const essentialFiles = ['README.md', 'README.txt', 'LICENSE', 'LICENSE.md', 'LICENSE.txt'];
      let hasReadme = false;
      let hasLicense = false;

      for (const fileName of essentialFiles) {
        const filePath = path.join(installedPackage.path, fileName);
        if (await fs.pathExists(filePath)) {
          if (fileName.toLowerCase().startsWith('readme')) {
            hasReadme = true;
          }
          if (fileName.toLowerCase().startsWith('license')) {
            hasLicense = true;
          }
        }
      }

      // Missing README is a low-severity issue
      if (!hasReadme) {
        issues.push(this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.MISSING_DOCUMENTATION,
          'Package is missing README file',
          IssueSeverity.LOW
        ));
      }

      // Missing LICENSE is a low-severity issue
      if (!hasLicense) {
        issues.push(this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.MISSING_LICENSE,
          'Package is missing LICENSE file',
          IssueSeverity.LOW
        ));
      }

    } catch (error) {
      // Don't fail the entire scan for essential files check
      console.warn(`Error checking essential files for ${installedPackage.name}:`, error);
    }

    return issues;
  }

  /**
   * Checks for corrupted nested node_modules
   */
  private async checkNestedNodeModules(installedPackage: any): Promise<DependencyIssue | null> {
    try {
      const nestedNodeModulesPath = path.join(installedPackage.path, 'node_modules');
      
      if (await fs.pathExists(nestedNodeModulesPath)) {
        const stats = await fs.stat(nestedNodeModulesPath);
        
        if (!stats.isDirectory()) {
          return this.createBrokenIssue(
            installedPackage.name,
            installedPackage.version,
            BrokenType.CORRUPTED_NESTED_MODULES,
            'node_modules exists but is not a directory'
          );
        }

        // Check if we can read the nested node_modules directory
        try {
          await fs.readdir(nestedNodeModulesPath);
        } catch (error) {
          return this.createBrokenIssue(
            installedPackage.name,
            installedPackage.version,
            BrokenType.CORRUPTED_NESTED_MODULES,
            `Cannot read nested node_modules: ${error}`
          );
        }
      }

      return null; // No issues with nested modules

    } catch (error) {
      return this.createBrokenIssue(
        installedPackage.name,
        installedPackage.version,
        BrokenType.ACCESS_ERROR,
        `Cannot check nested node_modules: ${error}`
      );
    }
  }

  /**
   * Checks file permissions for critical files
   */
  private async checkFilePermissions(installedPackage: any): Promise<DependencyIssue[]> {
    const issues: DependencyIssue[] = [];

    try {
      // Check if we can read the package directory
      try {
        await fs.access(installedPackage.path, fs.constants.R_OK);
      } catch (error) {
        issues.push(this.createBrokenIssue(
          installedPackage.name,
          installedPackage.version,
          BrokenType.PERMISSION_ERROR,
          'Package directory is not readable'
        ));
      }

      // Check package.json permissions
      const packageJsonPath = path.join(installedPackage.path, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        try {
          await fs.access(packageJsonPath, fs.constants.R_OK);
        } catch (error) {
          issues.push(this.createBrokenIssue(
            installedPackage.name,
            installedPackage.version,
            BrokenType.PERMISSION_ERROR,
            'package.json is not readable'
          ));
        }
      }

    } catch (error) {
      // Don't fail the entire scan for permission checks
      console.warn(`Error checking permissions for ${installedPackage.name}:`, error);
    }

    return issues;
  }

  /**
   * Creates a broken dependency issue
   */
  private createBrokenIssue(
    packageName: string,
    version: string,
    brokenType: BrokenType,
    description: string,
    severity: IssueSeverity = IssueSeverity.HIGH
  ): DependencyIssue {
    const typeDescription = this.getBrokenTypeDescription(brokenType);
    const fullDescription = `${typeDescription}: ${description}`;

    return {
      type: IssueType.BROKEN,
      packageName,
      currentVersion: version,
      expectedVersion: version,
      latestVersion: undefined,
      severity,
      description: fullDescription,
      fixable: this.isBrokenTypeFixable(brokenType)
    };
  }

  /**
   * Gets a human-readable description for broken types
   */
  private getBrokenTypeDescription(brokenType: BrokenType): string {
    switch (brokenType) {
      case BrokenType.MISSING_DIRECTORY:
        return 'Missing package directory';
      case BrokenType.MISSING_PACKAGE_JSON:
        return 'Missing package.json';
      case BrokenType.CORRUPTED_PACKAGE_JSON:
        return 'Corrupted package.json';
      case BrokenType.INVALID_PACKAGE_JSON:
        return 'Invalid package.json';
      case BrokenType.NAME_MISMATCH:
        return 'Package name mismatch';
      case BrokenType.MISSING_ENTRY_POINT:
        return 'Missing entry point';
      case BrokenType.INVALID_ENTRY_POINT:
        return 'Invalid entry point';
      case BrokenType.MISSING_DOCUMENTATION:
        return 'Missing documentation';
      case BrokenType.MISSING_LICENSE:
        return 'Missing license';
      case BrokenType.CORRUPTED_NESTED_MODULES:
        return 'Corrupted nested modules';
      case BrokenType.PERMISSION_ERROR:
        return 'Permission error';
      case BrokenType.ACCESS_ERROR:
        return 'Access error';
      default:
        return 'Package corruption';
    }
  }

  /**
   * Determines if a broken type is fixable
   */
  private isBrokenTypeFixable(brokenType: BrokenType): boolean {
    switch (brokenType) {
      case BrokenType.MISSING_DIRECTORY:
      case BrokenType.MISSING_PACKAGE_JSON:
      case BrokenType.CORRUPTED_PACKAGE_JSON:
      case BrokenType.INVALID_PACKAGE_JSON:
      case BrokenType.NAME_MISMATCH:
      case BrokenType.MISSING_ENTRY_POINT:
      case BrokenType.INVALID_ENTRY_POINT:
      case BrokenType.CORRUPTED_NESTED_MODULES:
        return true; // Can be fixed by reinstalling
      case BrokenType.MISSING_DOCUMENTATION:
      case BrokenType.MISSING_LICENSE:
        return false; // These are package author issues
      case BrokenType.PERMISSION_ERROR:
        return true; // Might be fixable by changing permissions or reinstalling
      case BrokenType.ACCESS_ERROR:
        return true; // Might be fixable by reinstalling
      default:
        return true;
    }
  }

  /**
   * Gets statistics about broken packages in the project
   */
  async getBrokenPackageStats(context: ScanContext): Promise<BrokenPackageStats> {
    const stats: BrokenPackageStats = {
      total: 0,
      missingDirectories: 0,
      corruptedPackageJson: 0,
      missingEntryPoints: 0,
      permissionErrors: 0,
      accessErrors: 0,
      packages: []
    };

    for (const installedPackage of context.nodeModules.packages) {
      const issues = await this.checkPackageIntegrity(installedPackage, context);
      
      if (issues.length > 0) {
        stats.total++;
        stats.packages.push({
          name: installedPackage.name,
          version: installedPackage.version,
          issues: issues.map(issue => ({
            type: this.extractBrokenTypeFromDescription(issue.description),
            description: issue.description,
            severity: issue.severity
          }))
        });

        // Count by type
        issues.forEach(issue => {
          const brokenType = this.extractBrokenTypeFromDescription(issue.description);
          switch (brokenType) {
            case BrokenType.MISSING_DIRECTORY:
              stats.missingDirectories++;
              break;
            case BrokenType.CORRUPTED_PACKAGE_JSON:
            case BrokenType.INVALID_PACKAGE_JSON:
            case BrokenType.MISSING_PACKAGE_JSON:
              stats.corruptedPackageJson++;
              break;
            case BrokenType.MISSING_ENTRY_POINT:
            case BrokenType.INVALID_ENTRY_POINT:
              stats.missingEntryPoints++;
              break;
            case BrokenType.PERMISSION_ERROR:
              stats.permissionErrors++;
              break;
            case BrokenType.ACCESS_ERROR:
              stats.accessErrors++;
              break;
          }
        });
      }
    }

    return stats;
  }

  /**
   * Extracts broken type from issue description (helper for stats)
   */
  private extractBrokenTypeFromDescription(description: string): BrokenType {
    if (description.includes('Missing package directory')) return BrokenType.MISSING_DIRECTORY;
    if (description.includes('Missing package.json')) return BrokenType.MISSING_PACKAGE_JSON;
    if (description.includes('Corrupted package.json')) return BrokenType.CORRUPTED_PACKAGE_JSON;
    if (description.includes('Invalid package.json')) return BrokenType.INVALID_PACKAGE_JSON;
    if (description.includes('Package name mismatch')) return BrokenType.NAME_MISMATCH;
    if (description.includes('Missing entry point')) return BrokenType.MISSING_ENTRY_POINT;
    if (description.includes('Invalid entry point')) return BrokenType.INVALID_ENTRY_POINT;
    if (description.includes('Missing documentation')) return BrokenType.MISSING_DOCUMENTATION;
    if (description.includes('Missing license')) return BrokenType.MISSING_LICENSE;
    if (description.includes('Corrupted nested modules')) return BrokenType.CORRUPTED_NESTED_MODULES;
    if (description.includes('Permission error')) return BrokenType.PERMISSION_ERROR;
    if (description.includes('Access error')) return BrokenType.ACCESS_ERROR;
    return BrokenType.ACCESS_ERROR; // Default
  }
}

// Supporting types and enums
enum BrokenType {
  MISSING_DIRECTORY = 'missing-directory',
  MISSING_PACKAGE_JSON = 'missing-package-json',
  CORRUPTED_PACKAGE_JSON = 'corrupted-package-json',
  INVALID_PACKAGE_JSON = 'invalid-package-json',
  NAME_MISMATCH = 'name-mismatch',
  MISSING_ENTRY_POINT = 'missing-entry-point',
  INVALID_ENTRY_POINT = 'invalid-entry-point',
  MISSING_DOCUMENTATION = 'missing-documentation',
  MISSING_LICENSE = 'missing-license',
  CORRUPTED_NESTED_MODULES = 'corrupted-nested-modules',
  PERMISSION_ERROR = 'permission-error',
  ACCESS_ERROR = 'access-error'
}

interface BrokenIssueInfo {
  type: BrokenType;
  description: string;
  severity: IssueSeverity;
}

interface BrokenPackageInfo {
  name: string;
  version: string;
  issues: BrokenIssueInfo[];
}

interface BrokenPackageStats {
  total: number;
  missingDirectories: number;
  corruptedPackageJson: number;
  missingEntryPoints: number;
  permissionErrors: number;
  accessErrors: number;
  packages: BrokenPackageInfo[];
}