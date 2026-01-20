import { DependencyScanner, ScanContext, ScanResult, ScannerType } from '../core/types';

/**
 * Abstract base class for dependency scanners
 * Provides common functionality and enforces the scanner interface
 */
export abstract class BaseDependencyScanner implements DependencyScanner {
  
  abstract scan(context: ScanContext): Promise<ScanResult>;
  abstract getScannerType(): ScannerType;

  /**
   * Validates the scan context before processing
   */
  protected validateContext(context: ScanContext): void {
    if (!context.projectPath) {
      throw new Error('Project path is required in scan context');
    }
    
    if (!context.packageJson) {
      throw new Error('Package.json is required in scan context');
    }
    
    if (!context.packageManager) {
      throw new Error('Package manager adapter is required in scan context');
    }
  }

  /**
   * Creates a base scan result structure
   */
  protected createBaseScanResult(): ScanResult {
    return {
      scannerType: this.getScannerType(),
      issues: [],
      securityIssues: []
    };
  }

  /**
   * Checks if a package is a development dependency
   */
  protected isDevDependency(packageName: string, context: ScanContext): boolean {
    return !!(context.packageJson.devDependencies && 
              context.packageJson.devDependencies[packageName]);
  }

  /**
   * Checks if a package is an optional dependency
   */
  protected isOptionalDependency(packageName: string, context: ScanContext): boolean {
    return !!(context.packageJson.optionalDependencies && 
              context.packageJson.optionalDependencies[packageName]);
  }

  /**
   * Checks if a package is a peer dependency
   */
  protected isPeerDependency(packageName: string, context: ScanContext): boolean {
    return !!(context.packageJson.peerDependencies && 
              context.packageJson.peerDependencies[packageName]);
  }

  /**
   * Gets the declared version for a package from package.json
   */
  protected getDeclaredVersion(packageName: string, context: ScanContext): string | undefined {
    // Check in different dependency types
    if (context.packageJson.dependencies?.[packageName]) {
      return context.packageJson.dependencies[packageName];
    }
    
    if (context.packageJson.devDependencies?.[packageName]) {
      return context.packageJson.devDependencies[packageName];
    }
    
    if (context.packageJson.peerDependencies?.[packageName]) {
      return context.packageJson.peerDependencies[packageName];
    }
    
    if (context.packageJson.optionalDependencies?.[packageName]) {
      return context.packageJson.optionalDependencies[packageName];
    }
    
    return undefined;
  }

  /**
   * Gets all declared dependencies from package.json
   */
  protected getAllDeclaredDependencies(context: ScanContext): Record<string, string> {
    const allDeps: Record<string, string> = {};
    
    // Merge all dependency types
    Object.assign(allDeps, context.packageJson.dependencies || {});
    Object.assign(allDeps, context.packageJson.devDependencies || {});
    Object.assign(allDeps, context.packageJson.peerDependencies || {});
    Object.assign(allDeps, context.packageJson.optionalDependencies || {});
    
    return allDeps;
  }

  /**
   * Finds an installed package by name
   */
  protected findInstalledPackage(packageName: string, context: ScanContext) {
    return context.nodeModules.packages.find(pkg => pkg.name === packageName);
  }

  /**
   * Checks if a package is installed
   */
  protected isPackageInstalled(packageName: string, context: ScanContext): boolean {
    return !!this.findInstalledPackage(packageName, context);
  }

  /**
   * Gets the installed version of a package
   */
  protected getInstalledVersion(packageName: string, context: ScanContext): string | undefined {
    const installedPackage = this.findInstalledPackage(packageName, context);
    return installedPackage?.version;
  }

  /**
   * Checks if an installed package is valid (has proper structure)
   */
  protected isInstalledPackageValid(packageName: string, context: ScanContext): boolean {
    const installedPackage = this.findInstalledPackage(packageName, context);
    return installedPackage?.isValid ?? false;
  }
}