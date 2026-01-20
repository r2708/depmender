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
 * Scanner that identifies packages listed in package.json but not present in node_modules
 */
export class MissingScanner extends BaseDependencyScanner {

  getScannerType(): ScannerType {
    return ScannerType.MISSING;
  }

  async scan(context: ScanContext): Promise<ScanResult> {
    this.validateContext(context);
    
    const result = this.createBaseScanResult();
    const allDependencies = this.getAllDeclaredDependencies(context);
    
    // Check each declared dependency to see if it's installed
    for (const [packageName, declaredVersion] of Object.entries(allDependencies)) {
      const issue = this.checkPackageInstallation(packageName, declaredVersion, context);
      
      if (issue) {
        result.issues.push(issue);
      }
    }
    
    return result;
  }

  /**
   * Checks if a declared package is properly installed
   */
  private checkPackageInstallation(
    packageName: string, 
    declaredVersion: string, 
    context: ScanContext
  ): DependencyIssue | null {
    // Check if package is installed
    if (this.isPackageInstalled(packageName, context)) {
      return null; // Package is installed, no issue
    }

    // Determine dependency type for better error messaging
    const dependencyType = this.getDependencyType(packageName, context);
    
    // Determine severity based on dependency type
    const severity = this.determineMissingSeverity(packageName, dependencyType, context);
    
    // Create descriptive message
    const description = this.createMissingDescription(
      packageName, 
      declaredVersion, 
      dependencyType
    );

    return {
      type: IssueType.MISSING,
      packageName,
      currentVersion: undefined, // Not installed
      expectedVersion: declaredVersion,
      latestVersion: undefined, // We don't fetch this in missing scanner
      severity,
      description,
      fixable: true // Missing packages can typically be installed
    };
  }

  /**
   * Determines the type of dependency (regular, dev, peer, optional)
   */
  private getDependencyType(packageName: string, context: ScanContext): DependencyType {
    if (this.isPeerDependency(packageName, context)) {
      return DependencyType.PEER;
    }
    
    if (this.isOptionalDependency(packageName, context)) {
      return DependencyType.OPTIONAL;
    }
    
    if (this.isDevDependency(packageName, context)) {
      return DependencyType.DEV;
    }
    
    return DependencyType.REGULAR;
  }

  /**
   * Determines the severity of a missing package based on its type and context
   */
  private determineMissingSeverity(
    packageName: string, 
    dependencyType: DependencyType, 
    context: ScanContext
  ): IssueSeverity {
    switch (dependencyType) {
      case DependencyType.REGULAR:
        // Regular dependencies are critical for application functionality
        return IssueSeverity.CRITICAL;
        
      case DependencyType.DEV:
        // Dev dependencies are important for development but not runtime
        return IssueSeverity.HIGH;
        
      case DependencyType.PEER:
        // Peer dependencies should be provided by the consuming application
        // Missing peer deps can cause runtime issues
        return IssueSeverity.HIGH;
        
      case DependencyType.OPTIONAL:
        // Optional dependencies are designed to be... optional
        return IssueSeverity.LOW;
        
      default:
        return IssueSeverity.MEDIUM;
    }
  }

  /**
   * Creates a descriptive message for a missing package
   */
  private createMissingDescription(
    packageName: string, 
    declaredVersion: string, 
    dependencyType: DependencyType
  ): string {
    const typeDescription = this.getDependencyTypeDescription(dependencyType);
    
    let description = `${typeDescription} '${packageName}@${declaredVersion}' is declared in package.json but not installed in node_modules.`;
    
    // Add type-specific guidance
    switch (dependencyType) {
      case DependencyType.REGULAR:
        description += ' This may cause runtime errors.';
        break;
        
      case DependencyType.DEV:
        description += ' This may affect development tools and build processes.';
        break;
        
      case DependencyType.PEER:
        description += ' This should be installed by the consuming application.';
        break;
        
      case DependencyType.OPTIONAL:
        description += ' This is optional and may provide enhanced functionality when available.';
        break;
    }
    
    // Add installation suggestion
    description += ` Run your package manager's install command to resolve.`;
    
    return description;
  }

  /**
   * Gets a human-readable description for dependency types
   */
  private getDependencyTypeDescription(dependencyType: DependencyType): string {
    switch (dependencyType) {
      case DependencyType.REGULAR:
        return 'Dependency';
      case DependencyType.DEV:
        return 'Development dependency';
      case DependencyType.PEER:
        return 'Peer dependency';
      case DependencyType.OPTIONAL:
        return 'Optional dependency';
      default:
        return 'Dependency';
    }
  }

  /**
   * Gets statistics about missing packages by type
   */
  getMissingPackageStats(context: ScanContext): MissingPackageStats {
    const allDependencies = this.getAllDeclaredDependencies(context);
    const stats: MissingPackageStats = {
      total: 0,
      regular: 0,
      dev: 0,
      peer: 0,
      optional: 0,
      packages: []
    };

    for (const [packageName, declaredVersion] of Object.entries(allDependencies)) {
      if (!this.isPackageInstalled(packageName, context)) {
        const dependencyType = this.getDependencyType(packageName, context);
        
        stats.total++;
        stats.packages.push({
          name: packageName,
          version: declaredVersion,
          type: dependencyType
        });

        switch (dependencyType) {
          case DependencyType.REGULAR:
            stats.regular++;
            break;
          case DependencyType.DEV:
            stats.dev++;
            break;
          case DependencyType.PEER:
            stats.peer++;
            break;
          case DependencyType.OPTIONAL:
            stats.optional++;
            break;
        }
      }
    }

    return stats;
  }
}

// Supporting types and enums
enum DependencyType {
  REGULAR = 'regular',
  DEV = 'dev',
  PEER = 'peer',
  OPTIONAL = 'optional'
}

interface MissingPackageInfo {
  name: string;
  version: string;
  type: DependencyType;
}

interface MissingPackageStats {
  total: number;
  regular: number;
  dev: number;
  peer: number;
  optional: number;
  packages: MissingPackageInfo[];
}