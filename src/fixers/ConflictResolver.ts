import {
  ConflictResolver as IConflictResolver,
  AnalysisResult,
  Conflict,
  Resolution,
  ConflictType,
  ConflictSeverity,
  ConflictingPackage,
  ResolutionStrategy,
  PackageChange,
  RiskAssessment,
  RiskLevel,
  DependencyIssue,
  IssueType,
  IssueSeverity
} from '../core/types';
import * as semver from 'semver';

/**
 * ConflictResolver handles complex multi-level dependency conflicts
 * and provides intelligent resolution strategies with compatibility preservation
 */
export class ConflictResolver implements IConflictResolver {
  
  /**
   * Detects multi-level dependency conflicts from analysis results
   */
  async detectConflicts(analysis: AnalysisResult): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    
    // Group issues by package name to identify conflicts
    const packageIssues = this.groupIssuesByPackage(analysis.issues);
    
    // Detect version range conflicts
    const versionConflicts = this.detectVersionRangeConflicts(packageIssues);
    conflicts.push(...versionConflicts);
    
    // Detect peer dependency conflicts
    const peerConflicts = this.detectPeerDependencyConflicts(packageIssues);
    conflicts.push(...peerConflicts);
    
    // Detect transitive dependency conflicts
    const transitiveConflicts = await this.detectTransitiveConflicts(analysis);
    conflicts.push(...transitiveConflicts);
    
    // Sort conflicts by severity (critical first)
    conflicts.sort((a, b) => this.compareConflictSeverity(a.severity, b.severity));
    
    return conflicts;
  }

  /**
   * Resolves a specific conflict using the best available strategy
   */
  async resolveConflict(conflict: Conflict): Promise<Resolution> {
    // Determine the best resolution strategy
    const strategy = this.determineResolutionStrategy(conflict);
    
    // Generate package changes based on strategy
    const changes = await this.generatePackageChanges(conflict, strategy);
    
    // Create risk assessment
    const riskAssessment = this.assessResolutionRisk(conflict, changes);
    
    // Generate explanation
    const explanation = this.generateResolutionExplanation(conflict, strategy, changes);
    
    return {
      strategy,
      changes,
      explanation,
      riskAssessment
    };
  }

  /**
   * Validates that a resolution is safe and compatible
   */
  async validateResolution(resolution: Resolution): Promise<boolean> {
    try {
      // Check if all version changes are valid semver
      for (const change of resolution.changes) {
        if (!semver.valid(change.toVersion)) {
          return false;
        }
        
        // Ensure version changes make sense
        if (change.changeType === 'update' && 
            semver.lt(change.toVersion, change.fromVersion)) {
          return false;
        }
        
        if (change.changeType === 'downgrade' && 
            semver.gt(change.toVersion, change.fromVersion)) {
          return false;
        }
      }
      
      // Check for circular dependencies in changes
      if (this.hasCircularDependencies(resolution.changes)) {
        return false;
      }
      
      // Validate risk level is appropriate
      if (resolution.riskAssessment.level === RiskLevel.CRITICAL && 
          resolution.changes.length > 0) {
        // Critical risk resolutions should have strong justification
        return resolution.riskAssessment.mitigations.length > 0;
      }
      
      return true;
    } catch (error) {
      console.warn('Resolution validation failed:', error);
      return false;
    }
  }

  /**
   * Applies multiple resolutions with compatibility preservation
   * Requirements: 5.3 - Compatibility preservation during resolution
   */
  async applyResolutions(resolutions: Resolution[]): Promise<{
    applied: Resolution[];
    failed: Resolution[];
    compatibilityIssues: string[];
  }> {
    const applied: Resolution[] = [];
    const failed: Resolution[] = [];
    const compatibilityIssues: string[] = [];
    
    // Sort resolutions by priority (breaking change minimization)
    const prioritizedResolutions = this.prioritizeResolutions(resolutions);
    
    // Track package versions to detect conflicts
    const packageVersions = new Map<string, string>();
    
    for (const resolution of prioritizedResolutions) {
      try {
        // Check compatibility with already applied changes
        const compatibilityCheck = this.checkResolutionCompatibility(
          resolution, 
          packageVersions
        );
        
        if (!compatibilityCheck.compatible) {
          compatibilityIssues.push(...compatibilityCheck.issues);
          failed.push(resolution);
          continue;
        }
        
        // Validate resolution before applying
        const isValid = await this.validateResolution(resolution);
        if (!isValid) {
          failed.push(resolution);
          continue;
        }
        
        // Apply the resolution (update package version tracking)
        for (const change of resolution.changes) {
          if (change.changeType !== 'remove') {
            packageVersions.set(change.packageName, change.toVersion);
          } else {
            packageVersions.delete(change.packageName);
          }
        }
        
        applied.push(resolution);
      } catch (error) {
        console.warn(`Failed to apply resolution: ${error}`);
        failed.push(resolution);
      }
    }
    
    return { applied, failed, compatibilityIssues };
  }

  /**
   * Prioritizes resolutions to minimize breaking changes
   * Requirements: 5.4 - Breaking change minimization
   */
  private prioritizeResolutions(resolutions: Resolution[]): Resolution[] {
    return resolutions.sort((a, b) => {
      // Priority 1: Risk level (lower risk first)
      const riskComparison = this.compareRiskLevels(a.riskAssessment.level, b.riskAssessment.level);
      if (riskComparison !== 0) return riskComparison;
      
      // Priority 2: Number of breaking changes (fewer first)
      const aBreakingChanges = this.countBreakingChanges(a.changes);
      const bBreakingChanges = this.countBreakingChanges(b.changes);
      if (aBreakingChanges !== bBreakingChanges) {
        return aBreakingChanges - bBreakingChanges;
      }
      
      // Priority 3: Strategy preference (safer strategies first)
      const strategyComparison = this.compareStrategies(a.strategy, b.strategy);
      if (strategyComparison !== 0) return strategyComparison;
      
      // Priority 4: Number of changes (fewer first)
      return a.changes.length - b.changes.length;
    });
  }

  /**
   * Checks if a resolution is compatible with already applied changes
   */
  private checkResolutionCompatibility(
    resolution: Resolution, 
    existingVersions: Map<string, string>
  ): { compatible: boolean; issues: string[] } {
    const issues: string[] = [];
    
    for (const change of resolution.changes) {
      const existingVersion = existingVersions.get(change.packageName);
      
      if (existingVersion && existingVersion !== change.fromVersion) {
        // Check if the change is compatible with existing version
        if (change.changeType === 'update' || change.changeType === 'downgrade') {
          try {
            // Check if versions are compatible
            if (!this.areVersionsCompatible(existingVersion, change.toVersion)) {
              issues.push(
                `Package ${change.packageName}: existing version ${existingVersion} ` +
                `conflicts with proposed version ${change.toVersion}`
              );
            }
          } catch (error) {
            issues.push(
              `Package ${change.packageName}: version compatibility check failed`
            );
          }
        }
      }
    }
    
    return {
      compatible: issues.length === 0,
      issues
    };
  }

  /**
   * Handles unresolvable conflicts with detailed explanations
   * Requirements: 5.5 - Unresolvable conflict explanation
   */
  async handleUnresolvableConflicts(conflicts: Conflict[]): Promise<{
    unresolvable: Conflict[];
    explanations: Map<Conflict, string>;
    manualResolutionOptions: Map<Conflict, string[]>;
  }> {
    const unresolvable: Conflict[] = [];
    const explanations = new Map<Conflict, string>();
    const manualResolutionOptions = new Map<Conflict, string[]>();
    
    for (const conflict of conflicts) {
      try {
        const resolution = await this.resolveConflict(conflict);
        const isValid = await this.validateResolution(resolution);
        
        // Check if resolution is actually viable
        if (!isValid || resolution.riskAssessment.level === RiskLevel.CRITICAL) {
          unresolvable.push(conflict);
          
          // Generate detailed explanation
          const explanation = this.generateUnresolvableExplanation(conflict, resolution);
          explanations.set(conflict, explanation);
          
          // Generate manual resolution options
          const manualOptions = this.generateManualResolutionOptions(conflict);
          manualResolutionOptions.set(conflict, manualOptions);
        }
      } catch (error) {
        // If resolution generation fails, it's definitely unresolvable
        unresolvable.push(conflict);
        explanations.set(conflict, `Conflict resolution failed: ${error}`);
        manualResolutionOptions.set(conflict, [
          'Review dependency requirements manually',
          'Consider alternative packages',
          'Contact package maintainers for compatibility updates'
        ]);
      }
    }
    
    return { unresolvable, explanations, manualResolutionOptions };
  }

  /**
   * Generates explanation for why a conflict cannot be automatically resolved
   */
  private generateUnresolvableExplanation(conflict: Conflict, attemptedResolution: Resolution): string {
    let explanation = `Cannot automatically resolve ${conflict.type} conflict for packages: `;
    explanation += conflict.packages.map(p => `${p.name}@${p.version}`).join(', ');
    explanation += '\n\nReasons:\n';
    
    // Analyze why the resolution failed
    if (attemptedResolution.riskAssessment.level === RiskLevel.CRITICAL) {
      explanation += '- Resolution would introduce critical breaking changes\n';
      explanation += '- Risk factors: ' + attemptedResolution.riskAssessment.factors.join(', ') + '\n';
    }
    
    if (attemptedResolution.changes.length === 0) {
      explanation += '- No viable version changes could be identified\n';
    }
    
    // Check for version incompatibilities
    const hasIncompatibleVersions = this.hasIncompatibleVersionRequirements(conflict);
    if (hasIncompatibleVersions) {
      explanation += '- Package version requirements are fundamentally incompatible\n';
    }
    
    // Check for circular dependencies
    if (this.hasCircularDependencies(attemptedResolution.changes)) {
      explanation += '- Resolution would create circular dependencies\n';
    }
    
    return explanation;
  }

  /**
   * Generates manual resolution options for unresolvable conflicts
   */
  private generateManualResolutionOptions(conflict: Conflict): string[] {
    const options: string[] = [];
    
    switch (conflict.type) {
      case ConflictType.PEER_DEPENDENCY:
        options.push('Install the required peer dependency manually');
        options.push('Update packages to versions with compatible peer requirements');
        options.push('Use npm overrides or yarn resolutions to force a specific version');
        break;
        
      case ConflictType.VERSION_RANGE:
        options.push('Update all conflicting packages to their latest compatible versions');
        options.push('Downgrade packages to a common compatible version');
        options.push('Consider using a different package that provides similar functionality');
        break;
        
      case ConflictType.TRANSITIVE:
        options.push('Update direct dependencies to resolve transitive conflicts');
        options.push('Use package manager overrides to force specific transitive versions');
        options.push('Consider switching to a different package manager (npm/yarn/pnpm)');
        break;
    }
    
    // Add general options
    options.push('Review package documentation for compatibility information');
    options.push('Check package issue trackers for known compatibility problems');
    options.push('Consider contributing to package compatibility improvements');
    
    return options;
  }

  // Enhanced helper methods

  /**
   * Compares risk levels for prioritization (lower risk = higher priority)
   */
  private compareRiskLevels(a: RiskLevel, b: RiskLevel): number {
    const riskOrder = {
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 1,
      [RiskLevel.HIGH]: 2,
      [RiskLevel.CRITICAL]: 3
    };
    return riskOrder[a] - riskOrder[b];
  }

  /**
   * Counts breaking changes in a set of package changes
   */
  private countBreakingChanges(changes: PackageChange[]): number {
    return changes.filter(change => {
      if (change.changeType === 'remove') return true;
      if (change.changeType === 'install') return false;
      
      try {
        const fromMajor = semver.major(change.fromVersion);
        const toMajor = semver.major(change.toVersion);
        return fromMajor !== toMajor;
      } catch {
        return false;
      }
    }).length;
  }

  /**
   * Compares resolution strategies for prioritization (safer strategies first)
   */
  private compareStrategies(a: ResolutionStrategy, b: ResolutionStrategy): number {
    const strategyOrder = {
      [ResolutionStrategy.UPDATE_TO_COMPATIBLE]: 0,
      [ResolutionStrategy.ADD_PEER_DEPENDENCY]: 1,
      [ResolutionStrategy.DOWNGRADE_TO_COMPATIBLE]: 2,
      [ResolutionStrategy.REMOVE_CONFLICTING]: 3
    };
    return strategyOrder[a] - strategyOrder[b];
  }

  /**
   * Checks if two versions are compatible (simplified implementation)
   */
  private areVersionsCompatible(version1: string, version2: string): boolean {
    try {
      // For now, consider versions compatible if they have the same major version
      return semver.major(version1) === semver.major(version2);
    } catch {
      return false;
    }
  }

  /**
   * Checks if a conflict has fundamentally incompatible version requirements
   */
  private hasIncompatibleVersionRequirements(conflict: Conflict): boolean {
    // Simplified check - in real implementation would analyze version ranges
    const versions = conflict.packages.map(p => p.version).filter(v => semver.valid(v));
    if (versions.length < 2) return false;
    
    // Check if all versions have different major versions
    const majorVersions = new Set(versions.map(v => semver.major(v)));
    return majorVersions.size === versions.length && versions.length > 2;
  }

  /**
   * Groups dependency issues by package name
   */
  private groupIssuesByPackage(issues: DependencyIssue[]): Map<string, DependencyIssue[]> {
    const grouped = new Map<string, DependencyIssue[]>();
    
    for (const issue of issues) {
      const existing = grouped.get(issue.packageName) || [];
      existing.push(issue);
      grouped.set(issue.packageName, existing);
    }
    
    return grouped;
  }

  /**
   * Detects version range conflicts between different requirements
   */
  private detectVersionRangeConflicts(packageIssues: Map<string, DependencyIssue[]>): Conflict[] {
    const conflicts: Conflict[] = [];
    
    for (const [packageName, issues] of packageIssues) {
      // Look for version mismatch and peer conflict issues for the same package
      const versionIssues = issues.filter(issue => 
        issue.type === IssueType.VERSION_MISMATCH || 
        issue.type === IssueType.PEER_CONFLICT
      );
      
      if (versionIssues.length > 1) {
        const conflictingPackages: ConflictingPackage[] = versionIssues.map(issue => ({
          name: packageName,
          version: issue.currentVersion || 'unknown',
          requiredBy: this.extractRequiredBy(issue.description),
          conflictsWith: this.extractConflictsWith(issue.description)
        }));
        
        const severity = this.determineConflictSeverity(versionIssues);
        
        conflicts.push({
          type: ConflictType.VERSION_RANGE,
          packages: conflictingPackages,
          description: `Version range conflict for ${packageName}: multiple incompatible version requirements`,
          severity
        });
      }
    }
    
    return conflicts;
  }

  /**
   * Detects peer dependency conflicts
   */
  private detectPeerDependencyConflicts(packageIssues: Map<string, DependencyIssue[]>): Conflict[] {
    const conflicts: Conflict[] = [];
    
    for (const [packageName, issues] of packageIssues) {
      const peerIssues = issues.filter(issue => issue.type === IssueType.PEER_CONFLICT);
      
      if (peerIssues.length > 0) {
        const conflictingPackages: ConflictingPackage[] = peerIssues.map(issue => ({
          name: packageName,
          version: issue.currentVersion || 'unknown',
          requiredBy: this.extractRequiredBy(issue.description),
          conflictsWith: this.extractConflictsWith(issue.description)
        }));
        
        const severity = this.determineConflictSeverity(peerIssues);
        
        conflicts.push({
          type: ConflictType.PEER_DEPENDENCY,
          packages: conflictingPackages,
          description: `Peer dependency conflict for ${packageName}: incompatible peer requirements`,
          severity
        });
      }
    }
    
    return conflicts;
  }

  /**
   * Detects transitive dependency conflicts (simplified implementation)
   */
  private async detectTransitiveConflicts(analysis: AnalysisResult): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    
    // Look for packages that have multiple version requirements through different paths
    const transitiveIssues = analysis.issues.filter(issue => 
      issue.description.includes('transitive') || 
      issue.description.includes('indirect')
    );
    
    // Group transitive issues by package
    const transitiveGroups = new Map<string, DependencyIssue[]>();
    for (const issue of transitiveIssues) {
      const existing = transitiveGroups.get(issue.packageName) || [];
      existing.push(issue);
      transitiveGroups.set(issue.packageName, existing);
    }
    
    for (const [packageName, issues] of transitiveGroups) {
      if (issues.length > 1) {
        const conflictingPackages: ConflictingPackage[] = issues.map(issue => ({
          name: packageName,
          version: issue.currentVersion || 'unknown',
          requiredBy: this.extractRequiredBy(issue.description),
          conflictsWith: this.extractConflictsWith(issue.description)
        }));
        
        const severity = this.determineConflictSeverity(issues);
        
        conflicts.push({
          type: ConflictType.TRANSITIVE,
          packages: conflictingPackages,
          description: `Transitive dependency conflict for ${packageName}: multiple version requirements through dependency chain`,
          severity
        });
      }
    }
    
    return conflicts;
  }

  /**
   * Determines the best resolution strategy for a conflict
   */
  private determineResolutionStrategy(conflict: Conflict): ResolutionStrategy {
    switch (conflict.type) {
      case ConflictType.PEER_DEPENDENCY:
        // For peer conflicts, usually need to add the peer dependency
        return ResolutionStrategy.ADD_PEER_DEPENDENCY;
        
      case ConflictType.VERSION_RANGE:
        // For version range conflicts, try to find compatible version
        if (this.canUpdateToCompatible(conflict)) {
          return ResolutionStrategy.UPDATE_TO_COMPATIBLE;
        } else if (this.canDowngradeToCompatible(conflict)) {
          return ResolutionStrategy.DOWNGRADE_TO_COMPATIBLE;
        } else {
          return ResolutionStrategy.REMOVE_CONFLICTING;
        }
        
      case ConflictType.TRANSITIVE:
        // For transitive conflicts, usually update to compatible version
        return ResolutionStrategy.UPDATE_TO_COMPATIBLE;
        
      default:
        return ResolutionStrategy.UPDATE_TO_COMPATIBLE;
    }
  }

  /**
   * Generates package changes based on resolution strategy
   */
  private async generatePackageChanges(conflict: Conflict, strategy: ResolutionStrategy): Promise<PackageChange[]> {
    const changes: PackageChange[] = [];
    
    switch (strategy) {
      case ResolutionStrategy.UPDATE_TO_COMPATIBLE:
        for (const pkg of conflict.packages) {
          const compatibleVersion = await this.findCompatibleVersion(pkg, 'update');
          if (compatibleVersion && compatibleVersion !== pkg.version) {
            changes.push({
              packageName: pkg.name,
              fromVersion: pkg.version,
              toVersion: compatibleVersion,
              changeType: 'update'
            });
          }
        }
        break;
        
      case ResolutionStrategy.DOWNGRADE_TO_COMPATIBLE:
        for (const pkg of conflict.packages) {
          const compatibleVersion = await this.findCompatibleVersion(pkg, 'downgrade');
          if (compatibleVersion && compatibleVersion !== pkg.version) {
            changes.push({
              packageName: pkg.name,
              fromVersion: pkg.version,
              toVersion: compatibleVersion,
              changeType: 'downgrade'
            });
          }
        }
        break;
        
      case ResolutionStrategy.ADD_PEER_DEPENDENCY:
        // Find the peer dependency that needs to be added
        const peerToAdd = this.findMissingPeerDependency(conflict);
        if (peerToAdd) {
          changes.push({
            packageName: peerToAdd.name,
            fromVersion: 'not-installed',
            toVersion: peerToAdd.version,
            changeType: 'install'
          });
        }
        break;
        
      case ResolutionStrategy.REMOVE_CONFLICTING:
        // Remove the most problematic package
        const packageToRemove = this.findMostProblematicPackage(conflict);
        if (packageToRemove) {
          changes.push({
            packageName: packageToRemove.name,
            fromVersion: packageToRemove.version,
            toVersion: 'removed',
            changeType: 'remove'
          });
        }
        break;
    }
    
    return changes;
  }

  /**
   * Assesses the risk of applying a resolution
   */
  private assessResolutionRisk(conflict: Conflict, changes: PackageChange[]): RiskAssessment {
    let riskLevel = RiskLevel.LOW;
    const factors: string[] = [];
    const mitigations: string[] = [];
    
    // Assess risk based on conflict severity
    if (conflict.severity === ConflictSeverity.CRITICAL) {
      riskLevel = RiskLevel.HIGH;
      factors.push('Critical conflict requires immediate attention');
    }
    
    // Assess risk based on number of changes
    if (changes.length > 3) {
      riskLevel = this.increaseRiskLevel(riskLevel);
      factors.push(`Multiple packages affected (${changes.length} changes)`);
    }
    
    // Assess risk based on change types
    const hasRemovals = changes.some(c => c.changeType === 'remove');
    const hasDowngrades = changes.some(c => c.changeType === 'downgrade');
    
    if (hasRemovals) {
      riskLevel = this.increaseRiskLevel(riskLevel);
      factors.push('Package removal may break functionality');
      mitigations.push('Test thoroughly after removal');
    }
    
    if (hasDowngrades) {
      riskLevel = this.increaseRiskLevel(riskLevel);
      factors.push('Version downgrades may remove features');
      mitigations.push('Review changelog for breaking changes');
    }
    
    // Assess risk based on major version changes
    const hasMajorVersionChanges = changes.some(c => {
      if (c.changeType === 'remove' || c.toVersion === 'removed') return false;
      try {
        return semver.major(c.toVersion) !== semver.major(c.fromVersion);
      } catch {
        return false;
      }
    });
    
    if (hasMajorVersionChanges) {
      riskLevel = this.increaseRiskLevel(riskLevel);
      factors.push('Major version changes may introduce breaking changes');
      mitigations.push('Review migration guides and test extensively');
    }
    
    // Add general mitigations
    if (riskLevel !== RiskLevel.LOW) {
      mitigations.push('Create backup before applying changes');
      mitigations.push('Run full test suite after resolution');
    }
    
    return {
      level: riskLevel,
      factors,
      mitigations
    };
  }

  /**
   * Generates human-readable explanation for the resolution
   */
  private generateResolutionExplanation(conflict: Conflict, strategy: ResolutionStrategy, changes: PackageChange[]): string {
    const packageNames = conflict.packages.map(p => p.name).join(', ');
    
    let explanation = `Resolving ${conflict.type} conflict for ${packageNames}:\n\n`;
    
    switch (strategy) {
      case ResolutionStrategy.UPDATE_TO_COMPATIBLE:
        explanation += 'Strategy: Update packages to compatible versions\n';
        break;
      case ResolutionStrategy.DOWNGRADE_TO_COMPATIBLE:
        explanation += 'Strategy: Downgrade packages to compatible versions\n';
        break;
      case ResolutionStrategy.ADD_PEER_DEPENDENCY:
        explanation += 'Strategy: Add missing peer dependency\n';
        break;
      case ResolutionStrategy.REMOVE_CONFLICTING:
        explanation += 'Strategy: Remove conflicting package\n';
        break;
    }
    
    explanation += '\nChanges to be made:\n';
    for (const change of changes) {
      switch (change.changeType) {
        case 'update':
          explanation += `- Update ${change.packageName} from ${change.fromVersion} to ${change.toVersion}\n`;
          break;
        case 'downgrade':
          explanation += `- Downgrade ${change.packageName} from ${change.fromVersion} to ${change.toVersion}\n`;
          break;
        case 'install':
          explanation += `- Install ${change.packageName} version ${change.toVersion}\n`;
          break;
        case 'remove':
          explanation += `- Remove ${change.packageName} (currently ${change.fromVersion})\n`;
          break;
      }
    }
    
    if (changes.length === 0) {
      explanation += '- No changes required (conflict may be resolved by other means)\n';
    }
    
    return explanation;
  }

  // Helper methods

  private compareConflictSeverity(a: ConflictSeverity, b: ConflictSeverity): number {
    const severityOrder = {
      [ConflictSeverity.CRITICAL]: 0,
      [ConflictSeverity.ERROR]: 1,
      [ConflictSeverity.WARNING]: 2
    };
    return severityOrder[a] - severityOrder[b];
  }

  private determineConflictSeverity(issues: DependencyIssue[]): ConflictSeverity {
    const hasCritical = issues.some(issue => issue.severity === IssueSeverity.CRITICAL);
    const hasHigh = issues.some(issue => issue.severity === IssueSeverity.HIGH);
    
    if (hasCritical) return ConflictSeverity.CRITICAL;
    if (hasHigh) return ConflictSeverity.ERROR;
    return ConflictSeverity.WARNING;
  }

  private extractRequiredBy(description: string): string {
    // Simple extraction - in real implementation would parse more sophisticated descriptions
    const match = description.match(/required by ([^,\s]+)/i);
    return match ? match[1] : 'unknown';
  }

  private extractConflictsWith(description: string): string[] {
    // Simple extraction - in real implementation would parse more sophisticated descriptions
    const match = description.match(/conflicts with ([^,\s]+)/i);
    return match ? [match[1]] : [];
  }

  private canUpdateToCompatible(conflict: Conflict): boolean {
    // Simplified logic - in real implementation would check actual version compatibility
    return conflict.packages.length > 0 && conflict.severity !== ConflictSeverity.CRITICAL;
  }

  private canDowngradeToCompatible(conflict: Conflict): boolean {
    // Simplified logic - in real implementation would check if downgrade is safe
    return conflict.packages.some(pkg => semver.valid(pkg.version) && semver.gt(pkg.version, '1.0.0'));
  }

  private async findCompatibleVersion(pkg: ConflictingPackage, direction: 'update' | 'downgrade'): Promise<string | null> {
    // Simplified implementation - in real implementation would query registry
    try {
      if (direction === 'update') {
        return semver.inc(pkg.version, 'patch') || pkg.version;
      } else {
        return semver.inc(pkg.version, 'prepatch') || pkg.version;
      }
    } catch {
      return null;
    }
  }

  private findMissingPeerDependency(conflict: Conflict): { name: string; version: string } | null {
    // Simplified implementation - would analyze peer dependency requirements
    const firstPackage = conflict.packages[0];
    if (firstPackage) {
      return {
        name: firstPackage.name + '-peer',
        version: '1.0.0'
      };
    }
    return null;
  }

  private findMostProblematicPackage(conflict: Conflict): ConflictingPackage | null {
    // Return the package with the most conflicts
    return conflict.packages.reduce((most, current) => {
      return current.conflictsWith.length > (most?.conflictsWith.length || 0) ? current : most;
    }, null as ConflictingPackage | null);
  }

  private increaseRiskLevel(currentLevel: RiskLevel): RiskLevel {
    switch (currentLevel) {
      case RiskLevel.LOW:
        return RiskLevel.MEDIUM;
      case RiskLevel.MEDIUM:
        return RiskLevel.HIGH;
      case RiskLevel.HIGH:
        return RiskLevel.CRITICAL;
      default:
        return currentLevel;
    }
  }

  private hasCircularDependencies(changes: PackageChange[]): boolean {
    // Simplified check - in real implementation would build dependency graph
    const packageNames = new Set(changes.map(c => c.packageName));
    return packageNames.size !== changes.length;
  }
}