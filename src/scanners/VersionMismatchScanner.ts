import * as semver from 'semver';
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
 * Scanner that finds discrepancies between package.json and installed versions
 */
export class VersionMismatchScanner extends BaseDependencyScanner {

  getScannerType(): ScannerType {
    return ScannerType.VERSION_MISMATCHES;
  }

  async scan(context: ScanContext): Promise<ScanResult> {
    this.validateContext(context);
    
    const result = this.createBaseScanResult();
    const allDependencies = this.getAllDeclaredDependencies(context);
    
    // Check each declared dependency for version mismatches
    for (const [packageName, declaredVersion] of Object.entries(allDependencies)) {
      const issue = this.checkVersionMismatch(packageName, declaredVersion, context);
      
      if (issue) {
        result.issues.push(issue);
      }
    }
    
    return result;
  }

  /**
   * Checks if there's a version mismatch between declared and installed versions
   */
  private checkVersionMismatch(
    packageName: string, 
    declaredVersion: string, 
    context: ScanContext
  ): DependencyIssue | null {
    // Get the installed version
    const installedVersion = this.getInstalledVersion(packageName, context);
    
    if (!installedVersion) {
      // Package not installed - this is handled by MissingScanner
      return null;
    }

    // Analyze the version mismatch
    const mismatchInfo = this.analyzeVersionMismatch(
      packageName,
      declaredVersion,
      installedVersion,
      context
    );

    if (!mismatchInfo.hasMismatch) {
      return null;
    }

    return {
      type: IssueType.VERSION_MISMATCH,
      packageName,
      currentVersion: installedVersion,
      expectedVersion: declaredVersion,
      latestVersion: undefined, // We don't fetch latest in this scanner
      severity: mismatchInfo.severity,
      description: mismatchInfo.description,
      fixable: mismatchInfo.fixable
    };
  }

  /**
   * Analyzes version mismatch between declared and installed versions
   */
  private analyzeVersionMismatch(
    packageName: string,
    declaredVersion: string,
    installedVersion: string,
    context: ScanContext
  ): VersionMismatchAnalysis {
    try {
      // Clean versions for semver operations
      const cleanDeclared = this.cleanVersionRange(declaredVersion);
      const cleanInstalled = semver.clean(installedVersion);
      
      if (!cleanInstalled) {
        return {
          hasMismatch: true,
          severity: IssueSeverity.HIGH,
          description: `Invalid installed version format: ${installedVersion}`,
          fixable: true
        };
      }

      // Check if installed version satisfies the declared range
      if (this.doesVersionSatisfyRange(installedVersion, declaredVersion)) {
        return { hasMismatch: false, severity: IssueSeverity.LOW, description: '', fixable: false };
      }

      // Determine the type and severity of mismatch
      const mismatchType = this.determineMismatchType(declaredVersion, installedVersion);
      const severity = this.determineMismatchSeverity(mismatchType, declaredVersion, installedVersion);
      const description = this.createMismatchDescription(
        packageName, 
        declaredVersion, 
        installedVersion, 
        mismatchType
      );

      return {
        hasMismatch: true,
        severity,
        description,
        fixable: this.isMismatchFixable(mismatchType)
      };

    } catch (error) {
      return {
        hasMismatch: true,
        severity: IssueSeverity.MEDIUM,
        description: `Error analyzing version mismatch for ${packageName}: ${error}`,
        fixable: true
      };
    }
  }

  /**
   * Checks if an installed version satisfies a declared version range
   */
  private doesVersionSatisfyRange(installedVersion: string, declaredVersion: string): boolean {
    try {
      return semver.satisfies(installedVersion, declaredVersion);
    } catch (error) {
      // If semver parsing fails, consider it a mismatch
      return false;
    }
  }

  /**
   * Cleans a version range for semver operations
   */
  private cleanVersionRange(versionRange: string): string {
    // Handle common version range prefixes and formats
    return versionRange.trim();
  }

  /**
   * Determines the type of version mismatch
   */
  private determineMismatchType(
    declaredVersion: string, 
    installedVersion: string
  ): VersionMismatchType {
    try {
      const cleanInstalled = semver.clean(installedVersion);
      
      if (!cleanInstalled) {
        return VersionMismatchType.INVALID_VERSION;
      }

      // Check if it's an exact version first (this should take priority)
      if (this.isExactVersion(declaredVersion)) {
        const cleanDeclared = semver.clean(declaredVersion);
        if (cleanDeclared && !semver.eq(cleanInstalled, cleanDeclared)) {
          return VersionMismatchType.EXACT_MISMATCH;
        }
      }

      // Check for prerelease mismatches
      if (semver.prerelease(cleanInstalled)) {
        return VersionMismatchType.PRERELEASE_MISMATCH;
      }

      // Check if installed version is higher than range allows
      if (this.isVersionHigherThanRange(installedVersion, declaredVersion)) {
        return VersionMismatchType.VERSION_TOO_HIGH;
      }

      // Check if installed version is lower than range allows
      if (this.isVersionLowerThanRange(installedVersion, declaredVersion)) {
        return VersionMismatchType.VERSION_TOO_LOW;
      }

      return VersionMismatchType.RANGE_MISMATCH;

    } catch (error) {
      return VersionMismatchType.INVALID_VERSION;
    }
  }

  /**
   * Checks if a version string represents an exact version (not a range)
   */
  private isExactVersion(versionString: string): boolean {
    // Check if the version string has any range operators
    if (versionString.match(/^[\^~>=<]/) || versionString.includes('||') || versionString.includes(' - ')) {
      return false;
    }
    
    // Check if it's a valid semver version
    return !!semver.clean(versionString.trim());
  }

  /**
   * Checks if installed version is higher than what the range allows
   */
  private isVersionHigherThanRange(installedVersion: string, declaredRange: string): boolean {
    try {
      // If the version doesn't satisfy the range, check if it's higher
      if (semver.satisfies(installedVersion, declaredRange)) {
        return false; // Version satisfies the range
      }
      
      // Get the minimum version that would satisfy the range
      const minVersion = semver.minVersion(declaredRange);
      if (!minVersion) {
        return false; // Can't determine range bounds
      }
      
      // If installed version is greater than the minimum required, it might be too high
      return semver.gt(installedVersion, minVersion.version);
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if installed version is lower than what the range allows
   */
  private isVersionLowerThanRange(installedVersion: string, declaredRange: string): boolean {
    try {
      // If the version satisfies the range, it's not too low
      if (semver.satisfies(installedVersion, declaredRange)) {
        return false;
      }
      
      // Get the minimum version that would satisfy the range
      const minVersion = semver.minVersion(declaredRange);
      if (!minVersion) {
        return false; // Can't determine range bounds
      }
      
      // If installed version is less than the minimum required, it's too low
      return semver.lt(installedVersion, minVersion.version);
    } catch (error) {
      return false;
    }
  }

  /**
   * Generates test versions higher than the current version for range testing
   */
  private generateTestVersions(baseVersion: string): string[] {
    try {
      const parsed = semver.parse(baseVersion);
      if (!parsed) return [];

      return [
        semver.inc(baseVersion, 'patch'),
        semver.inc(baseVersion, 'minor'),
        semver.inc(baseVersion, 'major')
      ].filter(v => v !== null) as string[];
    } catch (error) {
      return [];
    }
  }

  /**
   * Determines the severity of a version mismatch
   */
  private determineMismatchSeverity(
    mismatchType: VersionMismatchType,
    declaredVersion: string,
    installedVersion: string
  ): IssueSeverity {
    switch (mismatchType) {
      case VersionMismatchType.INVALID_VERSION:
        return IssueSeverity.CRITICAL;
        
      case VersionMismatchType.EXACT_MISMATCH:
        return IssueSeverity.HIGH;
        
      case VersionMismatchType.VERSION_TOO_HIGH:
        // Higher version might have breaking changes
        return this.assessBreakingChangeRisk(declaredVersion, installedVersion);
        
      case VersionMismatchType.VERSION_TOO_LOW:
        // Lower version might be missing features or fixes
        return IssueSeverity.MEDIUM;
        
      case VersionMismatchType.PRERELEASE_MISMATCH:
        return IssueSeverity.MEDIUM;
        
      case VersionMismatchType.RANGE_MISMATCH:
      default:
        return IssueSeverity.MEDIUM;
    }
  }

  /**
   * Assesses the risk of breaking changes between versions
   */
  private assessBreakingChangeRisk(declaredVersion: string, installedVersion: string): IssueSeverity {
    try {
      // Extract the base version from the range for comparison
      const baseVersion = this.extractBaseVersionFromRange(declaredVersion);
      if (!baseVersion) return IssueSeverity.MEDIUM;

      const cleanBase = semver.clean(baseVersion);
      const cleanInstalled = semver.clean(installedVersion);
      
      if (!cleanBase || !cleanInstalled) return IssueSeverity.MEDIUM;

      const diff = semver.diff(cleanBase, cleanInstalled);
      
      switch (diff) {
        case 'major':
          return IssueSeverity.HIGH;
        case 'minor':
          return IssueSeverity.MEDIUM;
        case 'patch':
        case 'prerelease':
          return IssueSeverity.LOW;
        default:
          return IssueSeverity.MEDIUM;
      }
    } catch (error) {
      return IssueSeverity.MEDIUM;
    }
  }

  /**
   * Extracts a base version from a version range for comparison
   */
  private extractBaseVersionFromRange(versionRange: string): string | null {
    try {
      // Remove common range operators and get the base version
      const cleaned = versionRange
        .replace(/^[\^~>=<]+/, '')
        .split('||')[0]
        .split(' - ')[0]
        .trim();
      
      return semver.clean(cleaned);
    } catch (error) {
      return null;
    }
  }

  /**
   * Creates a descriptive message for version mismatches
   */
  private createMismatchDescription(
    packageName: string,
    declaredVersion: string,
    installedVersion: string,
    mismatchType: VersionMismatchType
  ): string {
    const baseMessage = `Version mismatch for '${packageName}': declared '${declaredVersion}', installed '${installedVersion}'.`;
    
    switch (mismatchType) {
      case VersionMismatchType.INVALID_VERSION:
        return `${baseMessage} The installed version format is invalid.`;
        
      case VersionMismatchType.EXACT_MISMATCH:
        return `${baseMessage} Exact version mismatch detected.`;
        
      case VersionMismatchType.VERSION_TOO_HIGH:
        return `${baseMessage} Installed version is higher than the declared range allows.`;
        
      case VersionMismatchType.VERSION_TOO_LOW:
        return `${baseMessage} Installed version is lower than the declared range expects.`;
        
      case VersionMismatchType.PRERELEASE_MISMATCH:
        return `${baseMessage} Prerelease version installed but stable version expected.`;
        
      case VersionMismatchType.RANGE_MISMATCH:
      default:
        return `${baseMessage} The installed version does not satisfy the declared range.`;
    }
  }

  /**
   * Determines if a version mismatch type is fixable
   */
  private isMismatchFixable(mismatchType: VersionMismatchType): boolean {
    switch (mismatchType) {
      case VersionMismatchType.INVALID_VERSION:
        return true; // Can be fixed by reinstalling
      case VersionMismatchType.EXACT_MISMATCH:
        return true; // Can be fixed by installing correct version
      case VersionMismatchType.VERSION_TOO_HIGH:
        return true; // Can be fixed by downgrading or updating range
      case VersionMismatchType.VERSION_TOO_LOW:
        return true; // Can be fixed by upgrading
      case VersionMismatchType.PRERELEASE_MISMATCH:
        return true; // Can be fixed by installing stable version
      case VersionMismatchType.RANGE_MISMATCH:
      default:
        return true; // Generally fixable
    }
  }

  /**
   * Gets statistics about version mismatches in the project
   */
  getVersionMismatchStats(context: ScanContext): VersionMismatchStats {
    const allDependencies = this.getAllDeclaredDependencies(context);
    const stats: VersionMismatchStats = {
      total: 0,
      exactMismatches: 0,
      rangeMismatches: 0,
      tooHigh: 0,
      tooLow: 0,
      prerelease: 0,
      invalid: 0,
      packages: []
    };

    for (const [packageName, declaredVersion] of Object.entries(allDependencies)) {
      const installedVersion = this.getInstalledVersion(packageName, context);
      
      if (!installedVersion) {
        continue; // Skip missing packages
      }

      const mismatchInfo = this.analyzeVersionMismatch(
        packageName,
        declaredVersion,
        installedVersion,
        context
      );

      if (mismatchInfo.hasMismatch) {
        const mismatchType = this.determineMismatchType(declaredVersion, installedVersion);
        
        stats.total++;
        stats.packages.push({
          name: packageName,
          declared: declaredVersion,
          installed: installedVersion,
          type: mismatchType,
          severity: mismatchInfo.severity
        });

        switch (mismatchType) {
          case VersionMismatchType.EXACT_MISMATCH:
            stats.exactMismatches++;
            break;
          case VersionMismatchType.VERSION_TOO_HIGH:
            stats.tooHigh++;
            break;
          case VersionMismatchType.VERSION_TOO_LOW:
            stats.tooLow++;
            break;
          case VersionMismatchType.PRERELEASE_MISMATCH:
            stats.prerelease++;
            break;
          case VersionMismatchType.INVALID_VERSION:
            stats.invalid++;
            break;
          case VersionMismatchType.RANGE_MISMATCH:
          default:
            stats.rangeMismatches++;
            break;
        }
      }
    }

    return stats;
  }
}

// Supporting types and enums
enum VersionMismatchType {
  EXACT_MISMATCH = 'exact-mismatch',
  RANGE_MISMATCH = 'range-mismatch',
  VERSION_TOO_HIGH = 'version-too-high',
  VERSION_TOO_LOW = 'version-too-low',
  PRERELEASE_MISMATCH = 'prerelease-mismatch',
  INVALID_VERSION = 'invalid-version'
}

interface VersionMismatchAnalysis {
  hasMismatch: boolean;
  severity: IssueSeverity;
  description: string;
  fixable: boolean;
}

interface VersionMismatchInfo {
  name: string;
  declared: string;
  installed: string;
  type: VersionMismatchType;
  severity: IssueSeverity;
}

interface VersionMismatchStats {
  total: number;
  exactMismatches: number;
  rangeMismatches: number;
  tooHigh: number;
  tooLow: number;
  prerelease: number;
  invalid: number;
  packages: VersionMismatchInfo[];
}