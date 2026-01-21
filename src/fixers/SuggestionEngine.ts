import {
  AnalysisResult,
  FixSuggestion,
  FixType,
  RiskLevel,
  FixAction,
  DependencyIssue,
  IssueType,
  IssueSeverity,
  SecurityIssue,
  SecuritySeverity,
  PackageManagerType,
  RiskAssessment
} from '../core/types';
import * as semver from 'semver';

/**
 * Suggestion engine that generates smart recommendations for dependency fixes
 */
export class SuggestionEngine {
  
  /**
   * Generates fix suggestions for all detected issues in the analysis
   */
  async generateSuggestions(analysis: AnalysisResult): Promise<FixSuggestion[]> {
    const suggestions: FixSuggestion[] = [];

    // Generate suggestions for each type of issue
    for (const issue of analysis.issues) {
      const issueSuggestions = await this.generateIssueSpecificSuggestions(issue, analysis);
      suggestions.push(...issueSuggestions);
    }

    // Generate suggestions for security vulnerabilities
    for (const vulnerability of analysis.securityVulnerabilities) {
      const securitySuggestions = await this.generateSecuritySuggestions(vulnerability, analysis);
      suggestions.push(...securitySuggestions);
    }

    // Generate comprehensive peer dependency fixes
    const peerDependencyFixes = await this.generateComprehensivePeerDependencyFixes(analysis);
    suggestions.push(...peerDependencyFixes);

    // Generate version strategy suggestions
    const versionStrategies = await this.generateVersionStrategySuggestions(analysis);
    suggestions.push(...versionStrategies);

    // Remove duplicates based on description
    const uniqueSuggestions = this.removeDuplicateSuggestions(suggestions);

    // Sort suggestions by priority (safety-based prioritization)
    return this.prioritizeSuggestions(uniqueSuggestions);
  }

  /**
   * Removes duplicate suggestions based on description similarity
   */
  private removeDuplicateSuggestions(suggestions: FixSuggestion[]): FixSuggestion[] {
    const seen = new Set<string>();
    const unique: FixSuggestion[] = [];

    for (const suggestion of suggestions) {
      // Create a normalized key for deduplication
      const key = `${suggestion.type}:${suggestion.description.toLowerCase().replace(/\s+/g, ' ').trim()}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(suggestion);
      }
    }

    return unique;
  }

  /**
   * Generates suggestions specific to each issue type
   */
  private async generateIssueSpecificSuggestions(
    issue: DependencyIssue, 
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    switch (issue.type) {
      case IssueType.OUTDATED:
        return this.generateOutdatedPackageSuggestions(issue, analysis);
      case IssueType.MISSING:
        return this.generateMissingPackageSuggestions(issue, analysis);
      case IssueType.PEER_CONFLICT:
        return this.generatePeerConflictSuggestions(issue, analysis);
      case IssueType.VERSION_MISMATCH:
        return this.generateVersionMismatchSuggestions(issue, analysis);
      case IssueType.BROKEN:
        return this.generateBrokenPackageSuggestions(issue, analysis);
      default:
        return [];
    }
  }

  /**
   * Generates comprehensive peer dependency fix recommendations
   * Requirement 3.4: Peer dependency fix recommendations
   */
  private async generateComprehensivePeerDependencyFixes(
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    const suggestions: FixSuggestion[] = [];
    const peerConflicts = analysis.issues.filter(issue => issue.type === IssueType.PEER_CONFLICT);
    
    if (peerConflicts.length === 0) {
      return suggestions;
    }

    // Group peer conflicts by package to provide holistic solutions
    const conflictsByPackage = this.groupConflictsByPackage(peerConflicts);
    
    for (const [packageName, conflicts] of conflictsByPackage.entries()) {
      suggestions.push(...await this.generatePackageSpecificPeerFixes(packageName, conflicts, analysis));
    }

    // Generate ecosystem-wide peer dependency strategies
    suggestions.push(...this.generateEcosystemPeerStrategies(peerConflicts, analysis));

    return suggestions;
  }

  /**
   * Groups peer conflicts by package name for holistic resolution
   */
  private groupConflictsByPackage(conflicts: DependencyIssue[]): Map<string, DependencyIssue[]> {
    const grouped = new Map<string, DependencyIssue[]>();
    
    for (const conflict of conflicts) {
      const existing = grouped.get(conflict.packageName) || [];
      existing.push(conflict);
      grouped.set(conflict.packageName, existing);
    }
    
    return grouped;
  }

  /**
   * Generates package-specific peer dependency fixes
   */
  private async generatePackageSpecificPeerFixes(
    packageName: string,
    conflicts: DependencyIssue[],
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    const suggestions: FixSuggestion[] = [];
    
    // Analyze all version requirements for this package
    const versionRequirements = conflicts
      .map(c => c.expectedVersion)
      .filter((v): v is string => v !== undefined);
    
    if (versionRequirements.length > 0) {
      // Find a version that satisfies all requirements
      const unifiedVersion = this.findUnifiedVersion(versionRequirements);
      
      if (unifiedVersion) {
        suggestions.push({
          type: FixType.RESOLVE_CONFLICT,
          description: `Install unified peer dependency ${packageName}@${unifiedVersion} to resolve all conflicts`,
          risk: RiskLevel.MEDIUM,
          actions: [{
            type: 'install',
            packageName,
            version: unifiedVersion,
            command: this.getInstallCommand(packageName, unifiedVersion, analysis.packageManager)
          }],
          estimatedImpact: `Resolves ${conflicts.length} peer dependency conflict${conflicts.length > 1 ? 's' : ''} with single version`
        });
      } else {
        // Suggest alternative strategies when no unified version exists
        suggestions.push(...this.generateAlternativePeerStrategies(packageName, conflicts, analysis));
      }
    }

    return suggestions;
  }

  /**
   * Finds a version that satisfies all requirements
   */
  private findUnifiedVersion(requirements: string[]): string | null {
    try {
      // Start with the first requirement as base
      let satisfyingVersions = this.getVersionsFromRange(requirements[0]);
      
      // Filter versions that satisfy all requirements
      for (let i = 1; i < requirements.length; i++) {
        const currentRequirement = requirements[i];
        satisfyingVersions = satisfyingVersions.filter(version => {
          try {
            return semver.satisfies(version, currentRequirement);
          } catch {
            return false;
          }
        });
      }
      
      // Return the highest satisfying version
      if (satisfyingVersions.length > 0) {
        return satisfyingVersions.sort(semver.rcompare)[0];
      }
      
    } catch (error) {
      // Fallback: try to find a compromise version
      return this.findCompromiseVersion(requirements);
    }
    
    return null;
  }

  /**
   * Gets potential versions from a version range
   */
  private getVersionsFromRange(range: string): string[] {
    const versions: string[] = [];
    
    try {
      // For exact versions, return as-is
      if (semver.valid(range)) {
        versions.push(range);
        return versions;
      }
      
      // For ranges, generate potential versions
      const minVersion = semver.minVersion(range);
      if (minVersion) {
        versions.push(minVersion.version);
        
        // Add some incremental versions
        for (let i = 0; i < 5; i++) {
          const patch = semver.inc(minVersion.version, 'patch');
          const minor = semver.inc(minVersion.version, 'minor');
          if (patch && semver.satisfies(patch, range)) versions.push(patch);
          if (minor && semver.satisfies(minor, range)) versions.push(minor);
        }
      }
      
    } catch (error) {
      // Return empty array on error
    }
    
    return [...new Set(versions)]; // Remove duplicates
  }

  /**
   * Finds a compromise version when no unified version exists
   */
  private findCompromiseVersion(requirements: string[]): string | null {
    try {
      // Find the highest minimum version among all requirements
      const minVersions = requirements
        .map(req => semver.minVersion(req))
        .filter((v): v is semver.SemVer => v !== null)
        .sort(semver.rcompare);
      
      if (minVersions.length > 0) {
        return minVersions[0].version;
      }
      
    } catch (error) {
      // Return null on error
    }
    
    return null;
  }

  /**
   * Generates alternative peer dependency strategies
   */
  private generateAlternativePeerStrategies(
    packageName: string,
    conflicts: DependencyIssue[],
    analysis: AnalysisResult
  ): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];
    
    // Suggest using the most recent version requirement
    const mostRecentVersion = this.findMostRecentVersion(conflicts);
    if (mostRecentVersion) {
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: `Install latest required version ${packageName}@${mostRecentVersion} (may require dependency updates)`,
        risk: RiskLevel.HIGH,
        actions: [{
          type: 'install',
          packageName,
          version: mostRecentVersion,
          command: this.getInstallCommand(packageName, mostRecentVersion, analysis.packageManager)
        }],
        estimatedImpact: 'High risk - may require updating other dependencies to maintain compatibility'
      });
    }

    // Suggest workspace/monorepo solutions
    suggestions.push({
      type: FixType.RESOLVE_CONFLICT,
      description: `Consider using workspace/monorepo peer dependency hoisting for ${packageName}`,
      risk: RiskLevel.MEDIUM,
      actions: [],
      estimatedImpact: 'Architectural change - requires workspace configuration'
    });

    // Suggest dependency injection pattern
    suggestions.push({
      type: FixType.RESOLVE_CONFLICT,
      description: `Consider dependency injection pattern to avoid peer dependency conflicts with ${packageName}`,
      risk: RiskLevel.LOW,
      actions: [],
      estimatedImpact: 'Code refactoring required - improves long-term maintainability'
    });

    return suggestions;
  }

  /**
   * Finds the most recent version from conflicts
   */
  private findMostRecentVersion(conflicts: DependencyIssue[]): string | null {
    const versions = conflicts
      .map(c => c.expectedVersion)
      .filter((v): v is string => v !== undefined)
      .filter(v => semver.valid(v))
      .sort(semver.rcompare);
    
    return versions.length > 0 ? versions[0] : null;
  }

  /**
   * Generates ecosystem-wide peer dependency strategies
   */
  private generateEcosystemPeerStrategies(
    conflicts: DependencyIssue[],
    analysis: AnalysisResult
  ): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];
    
    if (conflicts.length > 3) {
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: `Consider peer dependency audit - ${conflicts.length} conflicts detected`,
        risk: RiskLevel.MEDIUM,
        actions: [],
        estimatedImpact: 'Comprehensive review recommended - multiple peer dependency issues detected'
      });
    }

    // Suggest package manager specific solutions
    const packageNames = conflicts.map(c => c.packageName).join(', ');
    
    if (analysis.packageManager === PackageManagerType.NPM) {
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: `Consider using npm overrides to resolve peer dependency conflicts for ${packageNames}`,
        risk: RiskLevel.HIGH,
        actions: [],
        estimatedImpact: 'Forces dependency resolution - may cause runtime issues'
      });
    } else if (analysis.packageManager === PackageManagerType.YARN) {
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: `Consider using Yarn resolutions to resolve peer dependency conflicts for ${packageNames}`,
        risk: RiskLevel.HIGH,
        actions: [],
        estimatedImpact: 'Forces dependency resolution - may cause runtime issues'
      });
    }

    return suggestions;
  }

  /**
   * Generates comprehensive version strategy suggestions
   * Requirement 3.5: Version strategy suggestions
   */
  private async generateVersionStrategySuggestions(
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    const suggestions: FixSuggestion[] = [];
    
    // Analyze version patterns across all issues
    const versionIssues = analysis.issues.filter(issue => 
      issue.type === IssueType.VERSION_MISMATCH || issue.type === IssueType.OUTDATED
    );

    if (versionIssues.length === 0) {
      return suggestions;
    }

    // Generate strategic recommendations based on issue patterns
    const strategyAnalysis = this.analyzeVersionStrategy(versionIssues);
    
    suggestions.push(...this.generateStrategicRecommendations(strategyAnalysis, analysis));
    suggestions.push(...this.generateMaintenanceStrategies(versionIssues, analysis));

    return suggestions;
  }

  /**
   * Analyzes version strategy patterns
   */
  private analyzeVersionStrategy(issues: DependencyIssue[]): {
    majorUpdatesNeeded: number;
    minorUpdatesNeeded: number;
    patchUpdatesNeeded: number;
    downgrades: number;
    riskDistribution: Record<RiskLevel, number>;
  } {
    const analysis = {
      majorUpdatesNeeded: 0,
      minorUpdatesNeeded: 0,
      patchUpdatesNeeded: 0,
      downgrades: 0,
      riskDistribution: {
        [RiskLevel.LOW]: 0,
        [RiskLevel.MEDIUM]: 0,
        [RiskLevel.HIGH]: 0,
        [RiskLevel.CRITICAL]: 0
      }
    };

    for (const issue of issues) {
      if (!issue.currentVersion || !issue.expectedVersion) continue;

      try {
        const current = semver.parse(issue.currentVersion);
        const expected = semver.parse(issue.expectedVersion);
        
        if (!current || !expected) continue;

        const risk = this.estimateBreakingChangeRisk(
          issue.currentVersion,
          issue.expectedVersion,
          issue.packageName
        );
        analysis.riskDistribution[risk]++;

        if (semver.gt(expected.version, current.version)) {
          const majorDiff = semver.major(expected.version) - semver.major(current.version);
          const minorDiff = semver.minor(expected.version) - semver.minor(current.version);
          
          if (majorDiff > 0) {
            analysis.majorUpdatesNeeded++;
          } else if (minorDiff > 0) {
            analysis.minorUpdatesNeeded++;
          } else {
            analysis.patchUpdatesNeeded++;
          }
        } else if (semver.lt(expected.version, current.version)) {
          analysis.downgrades++;
        }
      } catch (error) {
        // Skip invalid versions
      }
    }

    return analysis;
  }

  /**
   * Generates strategic recommendations based on version analysis
   */
  private generateStrategicRecommendations(
    analysis: {
      majorUpdatesNeeded: number;
      minorUpdatesNeeded: number;
      patchUpdatesNeeded: number;
      downgrades: number;
      riskDistribution: Record<RiskLevel, number>;
    },
    projectAnalysis: AnalysisResult
  ): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];

    // Suggest phased update strategy for many major updates
    if (analysis.majorUpdatesNeeded > 3) {
      suggestions.push({
        type: FixType.UPDATE_OUTDATED,
        description: `Phased update strategy recommended - ${analysis.majorUpdatesNeeded} major updates needed`,
        risk: RiskLevel.MEDIUM,
        actions: [],
        estimatedImpact: 'Reduces risk by updating dependencies in phases rather than all at once'
      });
    }

    // Suggest batch processing for many minor updates
    if (analysis.minorUpdatesNeeded > 5) {
      suggestions.push({
        type: FixType.UPDATE_OUTDATED,
        description: `Batch minor updates - ${analysis.minorUpdatesNeeded} minor updates available`,
        risk: RiskLevel.LOW,
        actions: [],
        estimatedImpact: 'Low risk batch update - can be done together for efficiency'
      });
    }

    // Warn about high-risk update concentration
    if (analysis.riskDistribution[RiskLevel.HIGH] + analysis.riskDistribution[RiskLevel.CRITICAL] > 2) {
      suggestions.push({
        type: FixType.UPDATE_OUTDATED,
        description: 'High-risk updates detected - consider staging environment testing',
        risk: RiskLevel.HIGH,
        actions: [],
        estimatedImpact: 'Multiple high-risk updates require careful testing and rollback planning'
      });
    }

    // Suggest downgrade investigation
    if (analysis.downgrades > 0) {
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: `Investigate ${analysis.downgrades} package downgrade${analysis.downgrades > 1 ? 's' : ''} - may indicate dependency conflicts`,
        risk: RiskLevel.MEDIUM,
        actions: [],
        estimatedImpact: 'Downgrades may indicate ecosystem compatibility issues requiring investigation'
      });
    }

    return suggestions;
  }

  /**
   * Generates maintenance strategy suggestions
   */
  private generateMaintenanceStrategies(
    issues: DependencyIssue[],
    analysis: AnalysisResult
  ): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];

    // Suggest automated dependency management
    if (issues.length > 10) {
      suggestions.push({
        type: FixType.UPDATE_OUTDATED,
        description: 'Consider automated dependency management tools (Dependabot, Renovate)',
        risk: RiskLevel.LOW,
        actions: [],
        estimatedImpact: 'Automates routine updates and reduces manual maintenance overhead'
      });
    }

    // Suggest version pinning strategy
    const outdatedIssues = issues.filter(i => i.type === IssueType.OUTDATED);
    if (outdatedIssues.length > 5) {
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: 'Consider version pinning strategy for critical dependencies',
        risk: RiskLevel.LOW,
        actions: [],
        estimatedImpact: 'Improves stability by controlling when updates are applied'
      });
    }

    // Suggest dependency audit schedule
    suggestions.push({
      type: FixType.UPDATE_OUTDATED,
      description: 'Establish regular dependency audit schedule',
      risk: RiskLevel.LOW,
      actions: [],
      estimatedImpact: 'Proactive maintenance reduces security risks and technical debt'
    });

    return suggestions;
  }

  /**
   * Generates safe update path recommendations for outdated packages
   * Requirement 3.1: Safe update path recommendations
   */
  private async generateOutdatedPackageSuggestions(
    issue: DependencyIssue,
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    const suggestions: FixSuggestion[] = [];
    
    if (!issue.currentVersion || !issue.latestVersion) {
      return suggestions;
    }

    // Determine safe update paths based on semantic versioning
    const updatePaths = this.calculateSafeUpdatePaths(
      issue.currentVersion,
      issue.latestVersion
    );

    for (const path of updatePaths) {
      const risk = this.estimateBreakingChangeRisk(
        issue.currentVersion,
        path.targetVersion,
        issue.packageName
      );

      suggestions.push({
        type: FixType.UPDATE_OUTDATED,
        description: `Update ${issue.packageName} from ${issue.currentVersion} to ${path.targetVersion} (${path.strategy})`,
        risk,
        actions: [{
          type: 'update',
          packageName: issue.packageName,
          version: path.targetVersion,
          command: this.getUpdateCommand(issue.packageName, path.targetVersion, analysis.packageManager)
        }],
        estimatedImpact: path.impact
      });
    }

    return suggestions;
  }

  /**
   * Calculates safe update paths for a package
   */
  private calculateSafeUpdatePaths(currentVersion: string, latestVersion: string): Array<{
    targetVersion: string;
    strategy: string;
    impact: string;
  }> {
    const paths: Array<{ targetVersion: string; strategy: string; impact: string }> = [];
    
    try {
      const current = semver.parse(currentVersion);
      const latest = semver.parse(latestVersion);
      
      if (!current || !latest) {
        // Fallback for non-semver versions
        paths.push({
          targetVersion: latestVersion,
          strategy: 'direct update',
          impact: 'Unknown impact - manual review recommended'
        });
        return paths;
      }

      // Patch update (safest)
      const nextPatch = semver.inc(currentVersion, 'patch');
      if (nextPatch && semver.lte(nextPatch, latestVersion)) {
        paths.push({
          targetVersion: nextPatch,
          strategy: 'patch update',
          impact: 'Low risk - bug fixes only'
        });
      }

      // Minor update (moderate risk)
      const nextMinor = semver.inc(currentVersion, 'minor');
      if (nextMinor && semver.lte(nextMinor, latestVersion)) {
        paths.push({
          targetVersion: nextMinor,
          strategy: 'minor update',
          impact: 'Moderate risk - new features, backward compatible'
        });
      }

      // Major update (high risk)
      if (semver.major(latest.version) > semver.major(current.version)) {
        paths.push({
          targetVersion: latestVersion,
          strategy: 'major update',
          impact: 'High risk - breaking changes possible'
        });
      }

      // If no incremental paths, suggest direct update
      if (paths.length === 0) {
        paths.push({
          targetVersion: latestVersion,
          strategy: 'direct update',
          impact: 'Review required - version gap analysis needed'
        });
      }

    } catch (error) {
      // Fallback for invalid semver
      paths.push({
        targetVersion: latestVersion,
        strategy: 'direct update',
        impact: 'Manual review required - invalid semantic versioning'
      });
    }

    return paths;
  }

  /**
   * Estimates breaking change risk based on version difference
   * Requirement 3.3: Breaking-change risk estimation
   */
  private estimateBreakingChangeRisk(
    currentVersion: string,
    targetVersion: string,
    packageName: string
  ): RiskLevel {
    try {
      const current = semver.parse(currentVersion);
      const target = semver.parse(targetVersion);
      
      if (!current || !target) {
        return RiskLevel.HIGH; // Unknown versions are risky
      }

      // Calculate version difference metrics
      const majorDiff = semver.major(target.version) - semver.major(current.version);
      const minorDiff = semver.minor(target.version) - semver.minor(current.version);
      const patchDiff = semver.patch(target.version) - semver.patch(current.version);

      // Major version change analysis
      if (majorDiff > 0) {
        // Multiple major versions = critical risk
        if (majorDiff > 2) {
          return RiskLevel.CRITICAL;
        }
        // Single major version jump = high risk, but consider pre-1.0 packages
        if (semver.major(current.version) === 0 || semver.major(target.version) === 0) {
          // Pre-1.0 packages may have breaking changes in minor versions
          return RiskLevel.HIGH;
        }
        return RiskLevel.HIGH;
      }

      // Downgrade risk assessment
      if (majorDiff < 0 || (majorDiff === 0 && minorDiff < 0)) {
        return RiskLevel.MEDIUM; // Downgrades can remove features
      }

      // Minor version change analysis
      if (minorDiff > 0) {
        // Pre-1.0 packages: minor changes can be breaking
        if (semver.major(current.version) === 0) {
          return RiskLevel.HIGH;
        }
        
        // Large minor version jumps may indicate significant changes
        if (minorDiff > 5) {
          return RiskLevel.MEDIUM;
        }
        
        // Regular minor updates should be backward compatible
        return RiskLevel.LOW;
      }

      // Patch version change analysis
      if (patchDiff > 0) {
        // Large patch jumps might indicate accumulated changes
        if (patchDiff > 10) {
          return RiskLevel.LOW; // Still low risk but worth noting
        }
        return RiskLevel.LOW;
      }

      // Same version or downgrade within same minor
      return RiskLevel.LOW;

    } catch (error) {
      return RiskLevel.HIGH; // Invalid semver is risky
    }
  }

  /**
   * Provides detailed risk assessment for version changes
   */
  private getDetailedRiskAssessment(
    currentVersion: string,
    targetVersion: string,
    packageName: string
  ): RiskAssessment {
    const riskLevel = this.estimateBreakingChangeRisk(currentVersion, targetVersion, packageName);
    const factors: string[] = [];
    const mitigations: string[] = [];

    try {
      const current = semver.parse(currentVersion);
      const target = semver.parse(targetVersion);
      
      if (!current || !target) {
        factors.push('Invalid semantic versioning detected');
        mitigations.push('Review package documentation for version compatibility');
        return { level: riskLevel, factors, mitigations };
      }

      const majorDiff = semver.major(target.version) - semver.major(current.version);
      const minorDiff = semver.minor(target.version) - semver.minor(current.version);
      const patchDiff = semver.patch(target.version) - semver.patch(current.version);

      // Analyze risk factors
      if (majorDiff > 0) {
        factors.push(`Major version increase (${majorDiff} version${majorDiff > 1 ? 's' : ''})`);
        factors.push('Potential breaking changes in API');
        mitigations.push('Review CHANGELOG.md or release notes');
        mitigations.push('Test thoroughly before deploying');
        mitigations.push('Consider updating in stages');
      }

      if (majorDiff < 0) {
        factors.push('Version downgrade requested');
        factors.push('May remove features or introduce bugs');
        mitigations.push('Verify all required features are available in target version');
      }

      if (semver.major(current.version) === 0 || semver.major(target.version) === 0) {
        factors.push('Pre-1.0 package version involved');
        factors.push('Semantic versioning rules may not apply strictly');
        mitigations.push('Check package documentation for stability guarantees');
      }

      if (minorDiff > 5) {
        factors.push('Large minor version jump');
        factors.push('Significant feature additions likely');
        mitigations.push('Review new features for potential conflicts');
      }

      if (patchDiff > 10) {
        factors.push('Many patch versions skipped');
        factors.push('Accumulated bug fixes and small changes');
        mitigations.push('Review patch notes for any behavior changes');
      }

      // Add general mitigations
      if (factors.length > 0) {
        mitigations.push('Run full test suite after update');
        mitigations.push('Create backup before applying changes');
      }

    } catch (error) {
      factors.push('Error analyzing version compatibility');
      mitigations.push('Manual review required');
    }

    return { level: riskLevel, factors, mitigations };
  }

  /**
   * Generates suggestions for missing packages
   */
  private async generateMissingPackageSuggestions(
    issue: DependencyIssue,
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    return [{
      type: FixType.INSTALL_MISSING,
      description: `Install missing package ${issue.packageName}`,
      risk: RiskLevel.LOW,
      actions: [{
        type: 'install',
        packageName: issue.packageName,
        version: issue.expectedVersion,
        command: this.getInstallCommand(issue.packageName, issue.expectedVersion, analysis.packageManager)
      }],
      estimatedImpact: 'Low risk - installing declared dependency'
    }];
  }

  /**
   * Generates peer dependency fix recommendations
   * Requirement 3.4: Peer dependency fix recommendations
   */
  private async generatePeerConflictSuggestions(
    issue: DependencyIssue,
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    const suggestions: FixSuggestion[] = [];

    // Suggest installing missing peer dependency
    if (issue.description.includes('missing')) {
      suggestions.push({
        type: FixType.INSTALL_MISSING,
        description: `Install missing peer dependency ${issue.packageName}`,
        risk: RiskLevel.MEDIUM,
        actions: [{
          type: 'install',
          packageName: issue.packageName,
          version: issue.expectedVersion,
          command: this.getInstallCommand(issue.packageName, issue.expectedVersion, analysis.packageManager)
        }],
        estimatedImpact: 'Medium risk - peer dependency installation may affect other packages'
      });
    }

    // Suggest resolving version conflicts with sophisticated analysis
    if (issue.description.includes('conflict') && issue.expectedVersion && issue.currentVersion) {
      const compatibleVersions = this.findCompatibleVersions(
        issue.currentVersion,
        issue.expectedVersion
      );

      // Generate suggestions for each compatible version
      for (const version of compatibleVersions) {
        const riskAssessment = this.getDetailedRiskAssessment(
          issue.currentVersion,
          version,
          issue.packageName
        );

        suggestions.push({
          type: FixType.RESOLVE_CONFLICT,
          description: `Update ${issue.packageName} to compatible version ${version}`,
          risk: riskAssessment.level,
          actions: [{
            type: 'update',
            packageName: issue.packageName,
            version: version,
            command: this.getUpdateCommand(issue.packageName, version, analysis.packageManager)
          }],
          estimatedImpact: this.generateImpactDescription(riskAssessment, version)
        });
      }

      // If no compatible versions found, suggest alternative strategies
      if (compatibleVersions.length === 0) {
        suggestions.push(...this.generateAlternativeConflictResolutions(issue, analysis));
      }
    }

    // Suggest peer dependency range adjustments
    if (issue.description.includes('range') || issue.description.includes('incompatible')) {
      suggestions.push(...this.generateRangeAdjustmentSuggestions(issue, analysis));
    }

    return suggestions;
  }

  /**
   * Generates alternative conflict resolution strategies when no compatible versions exist
   */
  private generateAlternativeConflictResolutions(
    issue: DependencyIssue,
    analysis: AnalysisResult
  ): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];

    // Suggest using resolutions/overrides
    suggestions.push({
      type: FixType.RESOLVE_CONFLICT,
      description: `Use package manager resolution override for ${issue.packageName}`,
      risk: RiskLevel.HIGH,
      actions: [{
        type: 'update',
        packageName: issue.packageName,
        version: issue.expectedVersion,
        command: this.getResolutionOverrideCommand(issue.packageName, issue.expectedVersion || 'latest', analysis.packageManager)
      }],
      estimatedImpact: 'High risk - forces version resolution, may cause runtime issues'
    });

    // Suggest finding alternative packages
    suggestions.push({
      type: FixType.RESOLVE_CONFLICT,
      description: `Consider alternative packages that don't conflict with ${issue.packageName}`,
      risk: RiskLevel.MEDIUM,
      actions: [],
      estimatedImpact: 'Requires manual research - may need to replace conflicting dependencies'
    });

    return suggestions;
  }

  /**
   * Generates suggestions for adjusting peer dependency ranges
   */
  private generateRangeAdjustmentSuggestions(
    issue: DependencyIssue,
    analysis: AnalysisResult
  ): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];

    if (!issue.currentVersion || !issue.expectedVersion) {
      return suggestions;
    }

    try {
      // Suggest widening the peer dependency range
      const widenedRange = this.calculateWidenedRange(issue.currentVersion, issue.expectedVersion);
      if (widenedRange) {
        suggestions.push({
          type: FixType.RESOLVE_CONFLICT,
          description: `Widen peer dependency range to ${widenedRange} for ${issue.packageName}`,
          risk: RiskLevel.MEDIUM,
          actions: [],
          estimatedImpact: 'Requires updating package.json peerDependencies - coordinate with package maintainer'
        });
      }

      // Suggest using exact version matching
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: `Use exact version ${issue.expectedVersion} for ${issue.packageName}`,
        risk: RiskLevel.LOW,
        actions: [{
          type: 'update',
          packageName: issue.packageName,
          version: issue.expectedVersion,
          command: this.getUpdateCommand(issue.packageName, issue.expectedVersion, analysis.packageManager)
        }],
        estimatedImpact: 'Low risk - uses exact version matching to avoid range conflicts'
      });

    } catch (error) {
      // Fallback suggestion
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: `Manual resolution required for ${issue.packageName} peer dependency conflict`,
        risk: RiskLevel.HIGH,
        actions: [],
        estimatedImpact: 'Requires manual analysis of dependency requirements'
      });
    }

    return suggestions;
  }

  /**
   * Calculates a widened version range that accommodates both versions
   */
  private calculateWidenedRange(currentVersion: string, expectedVersion: string): string | null {
    try {
      const current = semver.minVersion(currentVersion);
      const expected = semver.minVersion(expectedVersion);
      
      if (!current || !expected) {
        return null;
      }

      // Find the lower and higher versions
      const lower = semver.lt(current.version, expected.version) ? current.version : expected.version;
      const higher = semver.gt(current.version, expected.version) ? current.version : expected.version;

      // Create a range that includes both versions
      const lowerMajor = semver.major(lower);
      const higherMajor = semver.major(higher);

      if (lowerMajor === higherMajor) {
        // Same major version - use caret range from lower version
        return `^${lower}`;
      } else {
        // Different major versions - use range
        return `>=${lower} <${higherMajor + 1}.0.0`;
      }

    } catch (error) {
      return null;
    }
  }

  /**
   * Gets resolution override command for different package managers
   */
  private getResolutionOverrideCommand(packageName: string, version: string, packageManager: PackageManagerType): string {
    switch (packageManager) {
      case PackageManagerType.NPM:
        return `Add to package.json: "overrides": { "${packageName}": "${version}" }`;
      case PackageManagerType.YARN:
        return `Add to package.json: "resolutions": { "${packageName}": "${version}" }`;
      case PackageManagerType.PNPM:
        return `Add to package.json: "pnpm": { "overrides": { "${packageName}": "${version}" } }`;
      default:
        return `Add resolution override for ${packageName}@${version}`;
    }
  }

  /**
   * Generates impact description based on risk assessment
   */
  private generateImpactDescription(riskAssessment: RiskAssessment, version: string): string {
    const baseDescription = `Updates to version ${version}`;
    
    if (riskAssessment.factors.length === 0) {
      return `${baseDescription} - minimal impact expected`;
    }

    const riskFactors = riskAssessment.factors.slice(0, 2).join(', ');
    const mitigation = riskAssessment.mitigations[0] || 'thorough testing recommended';
    
    return `${baseDescription} - ${riskFactors}. ${mitigation}`;
  }

  /**
   * Finds compatible versions for conflict resolution
   * Requirement 3.2: Compatible version combinations
   */
  private findCompatibleVersions(currentVersion: string, expectedVersion: string): string[] {
    const compatibleVersions: string[] = [];
    
    try {
      // Parse version ranges and find intersection
      const currentRange = semver.validRange(currentVersion);
      const expectedRange = semver.validRange(expectedVersion);
      
      if (currentRange && expectedRange) {
        // Generate potential compatible versions
        const potentialVersions = this.generatePotentialVersions(currentVersion, expectedVersion);
        
        // Filter versions that satisfy both ranges
        for (const version of potentialVersions) {
          if (semver.satisfies(version, currentRange) && semver.satisfies(version, expectedRange)) {
            compatibleVersions.push(version);
          }
        }
        
        // If no intersection found, try to find the closest compatible versions
        if (compatibleVersions.length === 0) {
          const closestVersions = this.findClosestCompatibleVersions(currentVersion, expectedVersion);
          compatibleVersions.push(...closestVersions);
        }
      } else {
        // Handle cases where one or both are exact versions
        if (semver.valid(currentVersion) && semver.valid(expectedVersion)) {
          // Choose the higher version as it's more likely to be compatible
          const higher = semver.gt(currentVersion, expectedVersion) ? currentVersion : expectedVersion;
          compatibleVersions.push(higher);
        } else if (semver.valid(expectedVersion)) {
          compatibleVersions.push(expectedVersion);
        } else if (semver.valid(currentVersion)) {
          compatibleVersions.push(currentVersion);
        }
      }
      
      // Remove duplicates and sort by preference (higher versions first)
      const uniqueVersions = [...new Set(compatibleVersions)];
      return uniqueVersions.sort((a, b) => {
        try {
          return semver.rcompare(a, b); // Reverse compare for descending order
        } catch {
          return 0;
        }
      });
      
    } catch (error) {
      // Fallback for invalid semver
      const fallbackVersions = [];
      if (expectedVersion) fallbackVersions.push(expectedVersion);
      if (currentVersion && currentVersion !== expectedVersion) fallbackVersions.push(currentVersion);
      return fallbackVersions;
    }
  }

  /**
   * Generates potential versions to test for compatibility
   */
  private generatePotentialVersions(currentVersion: string, expectedVersion: string): string[] {
    const versions: string[] = [];
    
    try {
      // Add the exact versions if they're valid
      if (semver.valid(currentVersion)) versions.push(currentVersion);
      if (semver.valid(expectedVersion)) versions.push(expectedVersion);
      
      // Generate versions based on ranges
      const currentParsed = semver.minVersion(currentVersion);
      const expectedParsed = semver.minVersion(expectedVersion);
      
      if (currentParsed && expectedParsed) {
        // Add minimum versions from ranges
        versions.push(currentParsed.version);
        versions.push(expectedParsed.version);
        
        // Generate intermediate versions
        const baseVersion = semver.gt(currentParsed.version, expectedParsed.version) 
          ? expectedParsed.version 
          : currentParsed.version;
        
        // Add patch increments
        for (let i = 0; i < 5; i++) {
          const patchVersion = semver.inc(baseVersion, 'patch');
          if (patchVersion) versions.push(patchVersion);
        }
        
        // Add minor increments
        for (let i = 0; i < 3; i++) {
          const minorVersion = semver.inc(baseVersion, 'minor');
          if (minorVersion) versions.push(minorVersion);
        }
      }
      
    } catch (error) {
      // Return basic versions on error
    }
    
    return [...new Set(versions)]; // Remove duplicates
  }

  /**
   * Finds the closest compatible versions when no intersection exists
   */
  private findClosestCompatibleVersions(currentVersion: string, expectedVersion: string): string[] {
    const versions: string[] = [];
    
    try {
      const currentMin = semver.minVersion(currentVersion);
      const expectedMin = semver.minVersion(expectedVersion);
      
      if (currentMin && expectedMin) {
        // Suggest upgrading to the higher minimum version
        const higherVersion = semver.gt(currentMin.version, expectedMin.version) 
          ? currentMin.version 
          : expectedMin.version;
        versions.push(higherVersion);
        
        // Also suggest the next major version as a potential resolution
        const nextMajor = semver.inc(higherVersion, 'major');
        if (nextMajor) {
          versions.push(nextMajor);
        }
      }
      
    } catch (error) {
      // Fallback to suggesting both versions
      if (semver.valid(currentVersion)) versions.push(currentVersion);
      if (semver.valid(expectedVersion)) versions.push(expectedVersion);
    }
    
    return versions;
  }

  /**
   * Generates suggestions for version mismatches
   * Requirement 3.5: Version strategy suggestions
   */
  private async generateVersionMismatchSuggestions(
    issue: DependencyIssue,
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    const suggestions: FixSuggestion[] = [];

    if (!issue.currentVersion || !issue.expectedVersion) {
      return suggestions;
    }

    // Determine if we should upgrade or downgrade
    const shouldUpgrade = this.shouldUpgradeVersion(issue.currentVersion, issue.expectedVersion);
    const riskAssessment = this.getDetailedRiskAssessment(
      issue.currentVersion, 
      issue.expectedVersion, 
      issue.packageName
    );
    
    if (shouldUpgrade) {
      suggestions.push({
        type: FixType.UPDATE_OUTDATED,
        description: `Upgrade ${issue.packageName} from ${issue.currentVersion} to ${issue.expectedVersion}`,
        risk: riskAssessment.level,
        actions: [{
          type: 'update',
          packageName: issue.packageName,
          version: issue.expectedVersion,
          command: this.getUpdateCommand(issue.packageName, issue.expectedVersion, analysis.packageManager)
        }],
        estimatedImpact: this.generateUpgradeImpactDescription(riskAssessment)
      });

      // Suggest intermediate upgrade steps for high-risk updates
      if (riskAssessment.level === RiskLevel.HIGH || riskAssessment.level === RiskLevel.CRITICAL) {
        const intermediateVersions = this.findIntermediateVersions(issue.currentVersion, issue.expectedVersion);
        for (const version of intermediateVersions) {
          const intermediateRisk = this.getDetailedRiskAssessment(issue.currentVersion, version, issue.packageName);
          suggestions.push({
            type: FixType.UPDATE_OUTDATED,
            description: `Intermediate upgrade: ${issue.packageName} to ${version} (step-by-step approach)`,
            risk: intermediateRisk.level,
            actions: [{
              type: 'update',
              packageName: issue.packageName,
              version: version,
              command: this.getUpdateCommand(issue.packageName, version, analysis.packageManager)
            }],
            estimatedImpact: `Intermediate step to reduce upgrade risk - ${this.generateUpgradeImpactDescription(intermediateRisk)}`
          });
        }
      }
    } else {
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: `Downgrade ${issue.packageName} from ${issue.currentVersion} to ${issue.expectedVersion}`,
        risk: RiskLevel.MEDIUM,
        actions: [{
          type: 'update',
          packageName: issue.packageName,
          version: issue.expectedVersion,
          command: this.getUpdateCommand(issue.packageName, issue.expectedVersion, analysis.packageManager)
        }],
        estimatedImpact: this.generateDowngradeImpactDescription(issue.currentVersion, issue.expectedVersion)
      });
    }

    // Suggest updating package.json instead of installed version
    suggestions.push({
      type: FixType.RESOLVE_CONFLICT,
      description: `Update package.json to match installed version ${issue.currentVersion}`,
      risk: RiskLevel.LOW,
      actions: [],
      estimatedImpact: 'Low risk - aligns package.json with currently working version'
    });

    return suggestions;
  }

  /**
   * Finds intermediate versions for step-by-step upgrades
   */
  private findIntermediateVersions(currentVersion: string, targetVersion: string): string[] {
    const intermediateVersions: string[] = [];
    
    try {
      const current = semver.parse(currentVersion);
      const target = semver.parse(targetVersion);
      
      if (!current || !target) {
        return intermediateVersions;
      }

      const majorDiff = semver.major(target.version) - semver.major(current.version);
      
      // For major version jumps, suggest intermediate major versions
      if (majorDiff > 1) {
        for (let i = 1; i < majorDiff; i++) {
          const intermediateMajor = semver.major(current.version) + i;
          intermediateVersions.push(`${intermediateMajor}.0.0`);
        }
      }
      
      // For large minor version jumps within same major, suggest intermediate minors
      if (majorDiff === 0) {
        const minorDiff = semver.minor(target.version) - semver.minor(current.version);
        if (minorDiff > 5) {
          const midMinor = semver.minor(current.version) + Math.floor(minorDiff / 2);
          intermediateVersions.push(`${semver.major(current.version)}.${midMinor}.0`);
        }
      }
      
    } catch (error) {
      // Return empty array on error
    }
    
    return intermediateVersions.slice(0, 2); // Limit to 2 intermediate steps
  }

  /**
   * Generates upgrade impact description
   */
  private generateUpgradeImpactDescription(riskAssessment: RiskAssessment): string {
    const riskDescriptions = {
      [RiskLevel.LOW]: 'Low risk upgrade - backward compatible changes expected',
      [RiskLevel.MEDIUM]: 'Medium risk upgrade - new features added, test thoroughly',
      [RiskLevel.HIGH]: 'High risk upgrade - potential breaking changes, review documentation',
      [RiskLevel.CRITICAL]: 'Critical risk upgrade - major changes expected, extensive testing required'
    };

    let description = riskDescriptions[riskAssessment.level];
    
    if (riskAssessment.factors.length > 0) {
      const primaryFactor = riskAssessment.factors[0];
      description += `. ${primaryFactor}`;
    }
    
    return description;
  }

  /**
   * Generates downgrade impact description
   */
  private generateDowngradeImpactDescription(currentVersion: string, targetVersion: string): string {
    try {
      const majorDiff = semver.major(currentVersion) - semver.major(targetVersion);
      const minorDiff = semver.minor(currentVersion) - semver.minor(targetVersion);
      
      if (majorDiff > 0) {
        return `Major version downgrade - features may be removed, compatibility issues possible`;
      } else if (minorDiff > 0) {
        return `Minor version downgrade - some features may not be available`;
      } else {
        return `Patch version downgrade - bug fixes may be reverted`;
      }
    } catch (error) {
      return `Version downgrade - functionality may be reduced`;
    }
  }

  /**
   * Determines if a version should be upgraded or downgraded
   */
  private shouldUpgradeVersion(currentVersion: string, expectedVersion: string): boolean {
    try {
      return semver.gt(expectedVersion, currentVersion);
    } catch (error) {
      // Fallback: assume upgrade if we can't compare
      return true;
    }
  }

  /**
   * Generates suggestions for broken packages
   */
  private async generateBrokenPackageSuggestions(
    issue: DependencyIssue,
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    return [{
      type: FixType.REGENERATE_LOCKFILE,
      description: `Reinstall broken package ${issue.packageName}`,
      risk: RiskLevel.MEDIUM,
      actions: [
        {
          type: 'remove',
          packageName: issue.packageName,
          command: this.getRemoveCommand(issue.packageName, analysis.packageManager)
        },
        {
          type: 'install',
          packageName: issue.packageName,
          version: issue.expectedVersion,
          command: this.getInstallCommand(issue.packageName, issue.expectedVersion, analysis.packageManager)
        }
      ],
      estimatedImpact: 'Reinstalls package to fix corruption - low risk of data loss'
    }];
  }

  /**
   * Generates suggestions for security vulnerabilities
   */
  private async generateSecuritySuggestions(
    vulnerability: SecurityIssue,
    analysis: AnalysisResult
  ): Promise<FixSuggestion[]> {
    const suggestions: FixSuggestion[] = [];

    if (vulnerability.fixedIn) {
      // Determine risk level based on security severity, not just version change
      let riskLevel: RiskLevel;
      switch (vulnerability.severity) {
        case SecuritySeverity.CRITICAL:
          riskLevel = RiskLevel.CRITICAL;
          break;
        case SecuritySeverity.HIGH:
          riskLevel = RiskLevel.HIGH;
          break;
        case SecuritySeverity.MODERATE:
          riskLevel = RiskLevel.MEDIUM;
          break;
        case SecuritySeverity.LOW:
          riskLevel = RiskLevel.LOW;
          break;
        default:
          riskLevel = RiskLevel.HIGH; // Default to high for unknown severity
      }

      // Generate update suggestion when fix is available
      suggestions.push({
        type: FixType.UPDATE_OUTDATED,
        description: `Update ${vulnerability.packageName} to ${vulnerability.fixedIn} to fix security vulnerability`,
        risk: riskLevel,
        actions: [{
          type: 'update',
          packageName: vulnerability.packageName,
          version: vulnerability.fixedIn,
          command: this.getUpdateCommand(vulnerability.packageName, vulnerability.fixedIn, analysis.packageManager)
        }],
        estimatedImpact: `Fixes security vulnerability: ${vulnerability.vulnerability.title}`
      });
    } else {
      // Generate guidance suggestion when no fix is available
      const riskLevel = vulnerability.severity === SecuritySeverity.CRITICAL ? RiskLevel.CRITICAL : RiskLevel.HIGH;
      
      suggestions.push({
        type: FixType.RESOLVE_CONFLICT,
        description: `Security vulnerability in ${vulnerability.packageName} - no patch available`,
        risk: riskLevel,
        actions: [],
        estimatedImpact: `Security vulnerability: ${vulnerability.vulnerability.title}. Consider finding alternative packages or implementing workarounds.`
      });
    }

    return suggestions;
  }

  /**
   * Prioritizes suggestions based on safety and impact
   * Requirement 3.6: Safety-based prioritization
   */
  private prioritizeSuggestions(suggestions: FixSuggestion[]): FixSuggestion[] {
    return suggestions.sort((a, b) => {
      // First priority: Security fixes (highest priority)
      const aIsSecurity = this.isSecurityFix(a);
      const bIsSecurity = this.isSecurityFix(b);
      
      if (aIsSecurity && !bIsSecurity) return -1;
      if (!aIsSecurity && bIsSecurity) return 1;

      // Second priority: Critical issues that block functionality
      const aIsBlocking = this.isBlockingIssue(a);
      const bIsBlocking = this.isBlockingIssue(b);
      
      if (aIsBlocking && !bIsBlocking) return -1;
      if (!aIsBlocking && bIsBlocking) return 1;

      // Third priority: Risk level (lower risk first for non-security, non-blocking issues)
      const riskOrder = {
        [RiskLevel.LOW]: 0,
        [RiskLevel.MEDIUM]: 1,
        [RiskLevel.HIGH]: 2,
        [RiskLevel.CRITICAL]: 3
      };

      // For security fixes, prioritize by severity (critical security first)
      if (aIsSecurity && bIsSecurity) {
        return riskOrder[b.risk] - riskOrder[a.risk]; // Reverse for security (critical first)
      }

      // For non-security fixes, prioritize by safety (low risk first)
      const riskDiff = riskOrder[a.risk] - riskOrder[b.risk];
      if (riskDiff !== 0) return riskDiff;

      // Fourth priority: Fix type priority
      const typeOrder = this.getFixTypePriority();
      const typeDiff = typeOrder[a.type] - typeOrder[b.type];
      if (typeDiff !== 0) return typeDiff;

      // Fifth priority: Impact assessment
      const aImpactScore = this.calculateImpactScore(a);
      const bImpactScore = this.calculateImpactScore(b);
      
      return aImpactScore - bImpactScore;
    });
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
   * Determines if a suggestion addresses a blocking issue
   */
  private isBlockingIssue(suggestion: FixSuggestion): boolean {
    const blockingKeywords = ['missing', 'broken', 'corrupted', 'failed', 'error'];
    return blockingKeywords.some(keyword => 
      suggestion.description.toLowerCase().includes(keyword.toLowerCase())
    ) || suggestion.type === FixType.INSTALL_MISSING;
  }

  /**
   * Gets fix type priority order (lower number = higher priority)
   */
  private getFixTypePriority(): Record<FixType, number> {
    return {
      [FixType.INSTALL_MISSING]: 0,      // Highest priority - fixes broken functionality
      [FixType.RESOLVE_CONFLICT]: 1,     // High priority - resolves conflicts
      [FixType.UPDATE_OUTDATED]: 2,      // Medium priority - improvements
      [FixType.REGENERATE_LOCKFILE]: 3   // Lower priority - maintenance
    };
  }

  /**
   * Calculates impact score for prioritization (lower score = higher priority)
   */
  private calculateImpactScore(suggestion: FixSuggestion): number {
    let score = 0;

    // Factor in number of actions required
    score += suggestion.actions.length * 10;

    // Factor in complexity indicators
    if (suggestion.description.includes('manual')) score += 50;
    if (suggestion.description.includes('review')) score += 30;
    if (suggestion.description.includes('intermediate')) score += 20;
    if (suggestion.description.includes('step-by-step')) score += 15;

    // Factor in positive impact indicators
    if (suggestion.estimatedImpact.includes('Low risk')) score -= 20;
    if (suggestion.estimatedImpact.includes('backward compatible')) score -= 15;
    if (suggestion.estimatedImpact.includes('bug fixes')) score -= 10;

    // Factor in negative impact indicators
    if (suggestion.estimatedImpact.includes('breaking changes')) score += 40;
    if (suggestion.estimatedImpact.includes('extensive testing')) score += 30;
    if (suggestion.estimatedImpact.includes('may cause runtime issues')) score += 50;

    return Math.max(0, score); // Ensure non-negative score
  }

  /**
   * Gets the appropriate install command for the package manager
   */
  private getInstallCommand(packageName: string, version: string | undefined, packageManager: PackageManagerType): string {
    const versionSpec = version ? `@${version}` : '';
    
    switch (packageManager) {
      case PackageManagerType.NPM:
        return `npm install ${packageName}${versionSpec}`;
      case PackageManagerType.YARN:
        return `yarn add ${packageName}${versionSpec}`;
      case PackageManagerType.PNPM:
        return `pnpm add ${packageName}${versionSpec}`;
      default:
        return `npm install ${packageName}${versionSpec}`;
    }
  }

  /**
   * Gets the appropriate update command for the package manager
   */
  private getUpdateCommand(packageName: string, version: string, packageManager: PackageManagerType): string {
    switch (packageManager) {
      case PackageManagerType.NPM:
        return `npm install ${packageName}@${version}`;
      case PackageManagerType.YARN:
        return `yarn add ${packageName}@${version}`;
      case PackageManagerType.PNPM:
        return `pnpm add ${packageName}@${version}`;
      default:
        return `npm install ${packageName}@${version}`;
    }
  }

  /**
   * Gets the appropriate remove command for the package manager
   */
  private getRemoveCommand(packageName: string, packageManager: PackageManagerType): string {
    switch (packageManager) {
      case PackageManagerType.NPM:
        return `npm uninstall ${packageName}`;
      case PackageManagerType.YARN:
        return `yarn remove ${packageName}`;
      case PackageManagerType.PNPM:
        return `pnpm remove ${packageName}`;
      default:
        return `npm uninstall ${packageName}`;
    }
  }
}