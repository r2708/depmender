import * as semver from 'semver';
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
 * Scanner that analyzes peer dependency compatibility
 * Detects incompatible peer dependency requirements
 */
export class PeerConflictScanner extends BaseDependencyScanner {

  getScannerType(): ScannerType {
    return ScannerType.PEER_CONFLICTS;
  }

  async scan(context: ScanContext): Promise<ScanResult> {
    this.validateContext(context);
    
    const result = this.createBaseScanResult();
    
    // Build peer dependency map from all installed packages
    const peerDependencyMap = await this.buildPeerDependencyMap(context);
    
    // Analyze conflicts
    const conflicts = this.analyzePeerConflicts(peerDependencyMap, context);
    
    result.issues.push(...conflicts);
    
    return result;
  }

  /**
   * Builds a map of all peer dependencies required by installed packages
   */
  private async buildPeerDependencyMap(context: ScanContext): Promise<PeerDependencyMap> {
    const peerMap: PeerDependencyMap = new Map();
    
    // Check each installed package for peer dependencies
    for (const installedPackage of context.nodeModules.packages) {
      try {
        const packageJsonPath = path.join(installedPackage.path, 'package.json');
        
        if (await fs.pathExists(packageJsonPath)) {
          const packageJson = await fs.readJson(packageJsonPath);
          
          if (packageJson.peerDependencies) {
            for (const [peerName, peerRange] of Object.entries(packageJson.peerDependencies)) {
              if (!peerMap.has(peerName)) {
                peerMap.set(peerName, []);
              }
              
              peerMap.get(peerName)!.push({
                requiredBy: installedPackage.name,
                requiredByVersion: installedPackage.version,
                requiredRange: peerRange as string,
                isOptional: this.isOptionalPeerDependency(packageJson, peerName)
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Error reading package.json for ${installedPackage.name}:`, error);
      }
    }
    
    return peerMap;
  }

  /**
   * Checks if a peer dependency is marked as optional
   */
  private isOptionalPeerDependency(packageJson: any, peerName: string): boolean {
    // Check peerDependenciesMeta for optional flag
    if (packageJson.peerDependenciesMeta && packageJson.peerDependenciesMeta[peerName]) {
      return packageJson.peerDependenciesMeta[peerName].optional === true;
    }
    return false;
  }

  /**
   * Analyzes peer dependency conflicts
   */
  private analyzePeerConflicts(
    peerMap: PeerDependencyMap, 
    context: ScanContext
  ): DependencyIssue[] {
    const conflicts: DependencyIssue[] = [];
    
    for (const [peerName, requirements] of peerMap.entries()) {
      // Check for conflicts in this peer dependency
      const peerConflicts = this.analyzeSinglePeerConflicts(peerName, requirements, context);
      conflicts.push(...peerConflicts);
    }
    
    return conflicts;
  }

  /**
   * Analyzes conflicts for a single peer dependency
   */
  private analyzeSinglePeerConflicts(
    peerName: string,
    requirements: PeerRequirement[],
    context: ScanContext
  ): DependencyIssue[] {
    const conflicts: DependencyIssue[] = [];
    
    // Get the installed version of the peer dependency
    const installedVersion = this.getInstalledVersion(peerName, context);
    
    // Check if peer dependency is missing
    if (!installedVersion) {
      const missingPeerConflict = this.createMissingPeerConflict(peerName, requirements);
      if (missingPeerConflict) {
        conflicts.push(missingPeerConflict);
      }
      return conflicts; // No point checking version conflicts if it's missing
    }

    // Check for version range conflicts
    const versionConflicts = this.checkVersionRangeConflicts(
      peerName, 
      installedVersion, 
      requirements
    );
    conflicts.push(...versionConflicts);

    // Check for incompatible range requirements between packages
    const rangeConflicts = this.checkIncompatibleRanges(peerName, requirements);
    conflicts.push(...rangeConflicts);

    return conflicts;
  }

  /**
   * Creates a conflict issue for missing peer dependencies
   */
  private createMissingPeerConflict(
    peerName: string,
    requirements: PeerRequirement[]
  ): DependencyIssue | null {
    // Filter out optional peer dependencies for missing check
    const requiredPeers = requirements.filter(req => !req.isOptional);
    
    if (requiredPeers.length === 0) {
      return null; // All peer dependencies are optional
    }

    const requiredBy = requiredPeers.map(req => req.requiredBy);
    const ranges = requiredPeers.map(req => req.requiredRange);
    
    const severity = this.determineMissingPeerSeverity(requiredPeers.length);
    
    return {
      type: IssueType.PEER_CONFLICT,
      packageName: peerName,
      currentVersion: undefined, // Not installed
      expectedVersion: this.findCompatibleRange(ranges),
      latestVersion: undefined,
      severity,
      description: this.createMissingPeerDescription(peerName, requiredBy, ranges),
      fixable: true
    };
  }

  /**
   * Checks for version range conflicts with installed version
   */
  private checkVersionRangeConflicts(
    peerName: string,
    installedVersion: string,
    requirements: PeerRequirement[]
  ): DependencyIssue[] {
    const conflicts: DependencyIssue[] = [];
    
    for (const requirement of requirements) {
      if (!this.doesVersionSatisfyRange(installedVersion, requirement.requiredRange)) {
        const conflict = this.createVersionRangeConflict(
          peerName,
          installedVersion,
          requirement
        );
        conflicts.push(conflict);
      }
    }
    
    return conflicts;
  }

  /**
   * Checks for incompatible range requirements between different packages
   */
  private checkIncompatibleRanges(
    peerName: string,
    requirements: PeerRequirement[]
  ): DependencyIssue[] {
    const conflicts: DependencyIssue[] = [];
    
    if (requirements.length < 2) {
      return conflicts; // Need at least 2 requirements to have a conflict
    }

    // Check all pairs of requirements for compatibility
    for (let i = 0; i < requirements.length; i++) {
      for (let j = i + 1; j < requirements.length; j++) {
        const req1 = requirements[i];
        const req2 = requirements[j];
        
        if (!this.areRangesCompatible(req1.requiredRange, req2.requiredRange)) {
          const conflict = this.createRangeIncompatibilityConflict(
            peerName,
            req1,
            req2
          );
          conflicts.push(conflict);
        }
      }
    }
    
    return conflicts;
  }

  /**
   * Checks if a version satisfies a range
   */
  private doesVersionSatisfyRange(version: string, range: string): boolean {
    try {
      return semver.satisfies(version, range);
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if two version ranges are compatible (have overlapping versions)
   */
  private areRangesCompatible(range1: string, range2: string): boolean {
    try {
      // Generate some test versions and see if any satisfy both ranges
      const testVersions = this.generateTestVersions();
      
      return testVersions.some(version => 
        semver.satisfies(version, range1) && semver.satisfies(version, range2)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Generates test versions for compatibility checking
   */
  private generateTestVersions(): string[] {
    const versions: string[] = [];
    
    // Generate a range of common versions
    for (let major = 0; major <= 10; major++) {
      for (let minor = 0; minor <= 5; minor++) {
        for (let patch = 0; patch <= 2; patch++) {
          versions.push(`${major}.${minor}.${patch}`);
        }
      }
    }
    
    return versions;
  }

  /**
   * Finds a compatible range that satisfies multiple requirements
   */
  private findCompatibleRange(ranges: string[]): string {
    if (ranges.length === 0) return '';
    if (ranges.length === 1) return ranges[0];
    
    // Try to find the most restrictive range that satisfies all
    try {
      // For simplicity, return the first range
      // In a more sophisticated implementation, we'd compute the intersection
      return ranges[0];
    } catch (error) {
      return ranges.join(' || ');
    }
  }

  /**
   * Creates a version range conflict issue
   */
  private createVersionRangeConflict(
    peerName: string,
    installedVersion: string,
    requirement: PeerRequirement
  ): DependencyIssue {
    const severity = requirement.isOptional ? IssueSeverity.MEDIUM : IssueSeverity.HIGH;
    
    return {
      type: IssueType.PEER_CONFLICT,
      packageName: peerName,
      currentVersion: installedVersion,
      expectedVersion: requirement.requiredRange,
      latestVersion: undefined,
      severity,
      description: this.createVersionRangeConflictDescription(
        peerName,
        installedVersion,
        requirement
      ),
      fixable: true
    };
  }

  /**
   * Creates a range incompatibility conflict issue
   */
  private createRangeIncompatibilityConflict(
    peerName: string,
    req1: PeerRequirement,
    req2: PeerRequirement
  ): DependencyIssue {
    const severity = (req1.isOptional && req2.isOptional) ? 
      IssueSeverity.MEDIUM : IssueSeverity.HIGH;
    
    return {
      type: IssueType.PEER_CONFLICT,
      packageName: peerName,
      currentVersion: this.getInstalledVersion(peerName, {} as ScanContext), // Will be filled by caller
      expectedVersion: `${req1.requiredRange} AND ${req2.requiredRange}`,
      latestVersion: undefined,
      severity,
      description: this.createRangeIncompatibilityDescription(peerName, req1, req2),
      fixable: false // Range incompatibilities are harder to fix automatically
    };
  }

  /**
   * Determines severity for missing peer dependencies
   */
  private determineMissingPeerSeverity(requiredCount: number): IssueSeverity {
    if (requiredCount >= 3) {
      return IssueSeverity.CRITICAL;
    } else if (requiredCount >= 2) {
      return IssueSeverity.HIGH;
    } else {
      return IssueSeverity.MEDIUM;
    }
  }

  /**
   * Creates description for missing peer dependency
   */
  private createMissingPeerDescription(
    peerName: string,
    requiredBy: string[],
    ranges: string[]
  ): string {
    const requiredByList = requiredBy.join(', ');
    const rangeList = [...new Set(ranges)].join(', ');
    
    return `Peer dependency '${peerName}' is required by ${requiredByList} but not installed. ` +
           `Required versions: ${rangeList}. Install the peer dependency to resolve this conflict.`;
  }

  /**
   * Creates description for version range conflict
   */
  private createVersionRangeConflictDescription(
    peerName: string,
    installedVersion: string,
    requirement: PeerRequirement
  ): string {
    const optionalText = requirement.isOptional ? ' (optional)' : '';
    
    return `Peer dependency '${peerName}@${installedVersion}' does not satisfy the range ` +
           `'${requirement.requiredRange}' required by '${requirement.requiredBy}'${optionalText}. ` +
           `Consider updating '${peerName}' to a compatible version.`;
  }

  /**
   * Creates description for range incompatibility
   */
  private createRangeIncompatibilityDescription(
    peerName: string,
    req1: PeerRequirement,
    req2: PeerRequirement
  ): string {
    return `Incompatible peer dependency ranges for '${peerName}': ` +
           `'${req1.requiredBy}' requires '${req1.requiredRange}' but ` +
           `'${req2.requiredBy}' requires '${req2.requiredRange}'. ` +
           `These ranges have no compatible versions.`;
  }

  /**
   * Gets statistics about peer conflicts in the project
   */
  async getPeerConflictStats(context: ScanContext): Promise<PeerConflictStats> {
    const peerMap = await this.buildPeerDependencyMap(context);
    const stats: PeerConflictStats = {
      totalPeerDependencies: peerMap.size,
      missingPeers: 0,
      versionConflicts: 0,
      rangeIncompatibilities: 0,
      optionalConflicts: 0,
      conflicts: []
    };

    for (const [peerName, requirements] of peerMap.entries()) {
      const installedVersion = this.getInstalledVersion(peerName, context);
      
      const conflictInfo: PeerConflictInfo = {
        peerName,
        installedVersion,
        requirements: requirements.map(req => ({
          requiredBy: req.requiredBy,
          range: req.requiredRange,
          isOptional: req.isOptional
        })),
        conflictTypes: []
      };

      // Check for missing peer
      if (!installedVersion) {
        const requiredPeers = requirements.filter(req => !req.isOptional);
        if (requiredPeers.length > 0) {
          stats.missingPeers++;
          conflictInfo.conflictTypes.push('missing');
        }
      } else {
        // Check version conflicts
        const hasVersionConflict = requirements.some(req => 
          !this.doesVersionSatisfyRange(installedVersion, req.requiredRange)
        );
        
        if (hasVersionConflict) {
          stats.versionConflicts++;
          conflictInfo.conflictTypes.push('version-mismatch');
        }
      }

      // Check range incompatibilities
      if (requirements.length > 1) {
        let hasRangeConflict = false;
        for (let i = 0; i < requirements.length && !hasRangeConflict; i++) {
          for (let j = i + 1; j < requirements.length; j++) {
            if (!this.areRangesCompatible(requirements[i].requiredRange, requirements[j].requiredRange)) {
              hasRangeConflict = true;
              break;
            }
          }
        }
        
        if (hasRangeConflict) {
          stats.rangeIncompatibilities++;
          conflictInfo.conflictTypes.push('range-incompatible');
        }
      }

      // Count optional conflicts
      const optionalConflicts = requirements.filter(req => req.isOptional).length;
      if (optionalConflicts > 0 && conflictInfo.conflictTypes.length > 0) {
        stats.optionalConflicts++;
      }

      if (conflictInfo.conflictTypes.length > 0) {
        stats.conflicts.push(conflictInfo);
      }
    }

    return stats;
  }
}

// Supporting types and interfaces
type PeerDependencyMap = Map<string, PeerRequirement[]>;

interface PeerRequirement {
  requiredBy: string;
  requiredByVersion: string;
  requiredRange: string;
  isOptional: boolean;
}

interface PeerRequirementInfo {
  requiredBy: string;
  range: string;
  isOptional: boolean;
}

interface PeerConflictInfo {
  peerName: string;
  installedVersion?: string;
  requirements: PeerRequirementInfo[];
  conflictTypes: string[];
}

interface PeerConflictStats {
  totalPeerDependencies: number;
  missingPeers: number;
  versionConflicts: number;
  rangeIncompatibilities: number;
  optionalConflicts: number;
  conflicts: PeerConflictInfo[];
}