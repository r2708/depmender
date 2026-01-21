import {
  HealthReporter as IHealthReporter,
  AnalysisResult,
  HealthReport,
  ReportSummary,
  OutdatedPackage,
  PeerConflict,
  Recommendation,
  DependencyIssue,
  SecurityIssue,
  IssueType,
  IssueSeverity,
  SecuritySeverity
} from '../core/types';

/**
 * Health reporter that generates comprehensive dependency health reports
 */
export class HealthReporter implements IHealthReporter {
  
  /**
   * Generates a comprehensive health report from analysis results
   */
  async generateReport(analysis: AnalysisResult): Promise<HealthReport> {
    const summary = this.generateSummary(analysis);
    const outdatedPackages = this.extractOutdatedPackages(analysis.issues);
    const peerConflicts = this.extractPeerConflicts(analysis.issues);
    const recommendations = this.generateRecommendations(analysis);

    return {
      healthScore: analysis.healthScore,
      summary,
      outdatedPackages,
      securityIssues: analysis.securityVulnerabilities,
      peerConflicts,
      recommendations,
      projectInfo: analysis.projectInfo
    };
  }

  /**
   * Formats the health report for CLI output with clear structure and categorization
   */
  formatForCLI(report: HealthReport): string {
    const lines: string[] = [];
    
    // Header
    lines.push('='.repeat(60));
    lines.push('📊 DEPENDENCY HEALTH REPORT');
    lines.push('='.repeat(60));
    lines.push('');

    // Project Information
    lines.push(`📦 Project: ${report.projectInfo.name}@${report.projectInfo.version}`);
    lines.push(`📁 Path: ${report.projectInfo.path}`);
    lines.push(`⚙️  Package Manager: ${report.projectInfo.packageManager}`);
    lines.push('');

    // Health Score with visual indicator
    const healthIndicator = this.getHealthIndicator(report.healthScore);
    lines.push(`🏥 Overall Health Score: ${report.healthScore}/100 ${healthIndicator}`);
    lines.push('');

    // Summary section
    lines.push('📋 SUMMARY');
    lines.push('-'.repeat(20));
    lines.push(`Total Packages: ${report.summary.totalPackages}`);
    lines.push(`Issues Found: ${report.summary.issuesFound}`);
    lines.push(`Critical Issues: ${report.summary.criticalIssues}`);
    lines.push(`Security Vulnerabilities: ${report.summary.securityVulnerabilities}`);
    lines.push('');

    // Critical Issues Section (emphasized)
    if (report.summary.criticalIssues > 0) {
      lines.push('🚨 CRITICAL ISSUES - IMMEDIATE ATTENTION REQUIRED');
      lines.push('-'.repeat(50));
      
      // Show critical security issues first
      const criticalSecurity = report.securityIssues.filter(
        issue => issue.severity === SecuritySeverity.CRITICAL
      );
      
      if (criticalSecurity.length > 0) {
        lines.push('🔒 Critical Security Vulnerabilities:');
        for (const issue of criticalSecurity) {
          lines.push(`  ⚠️  ${issue.packageName}@${issue.version}`);
          lines.push(`      ${issue.vulnerability.title}`);
          lines.push(`      CVSS: ${issue.vulnerability.cvss}`);
          if (issue.fixedIn) {
            lines.push(`      Fixed in: ${issue.fixedIn}`);
          }
        }
        lines.push('');
      }
      
      // Show other critical issues
      const otherCritical = this.getCriticalNonSecurityIssues(report);
      if (otherCritical.length > 0) {
        lines.push('⚠️  Other Critical Issues:');
        for (const issue of otherCritical) {
          lines.push(`  • ${issue}`);
        }
        lines.push('');
      }
    }

    // Security Issues Section (highlighted)
    if (report.securityIssues.length > 0) {
      lines.push('🔒 SECURITY VULNERABILITIES');
      lines.push('-'.repeat(30));
      
      const groupedBySeverity = this.groupSecurityBySeverity(report.securityIssues);
      
      for (const [severity, issues] of Object.entries(groupedBySeverity)) {
        if (issues.length > 0) {
          const severityIcon = this.getSecuritySeverityIcon(severity as SecuritySeverity);
          lines.push(`${severityIcon} ${severity.toUpperCase()} (${issues.length})`);
          
          for (const issue of issues) {
            lines.push(`  📦 ${issue.packageName}@${issue.version}`);
            lines.push(`     ${issue.vulnerability.title}`);
            lines.push(`     CVSS: ${issue.vulnerability.cvss}`);
            if (issue.fixedIn) {
              lines.push(`     ✅ Fixed in: ${issue.fixedIn}`);
            } else if (issue.patchAvailable) {
              lines.push(`     🔧 Patch available`);
            } else {
              lines.push(`     ❌ No patch available`);
            }
          }
          lines.push('');
        }
      }
    }

    // Outdated Packages Section
    if (report.outdatedPackages.length > 0) {
      lines.push('📦 OUTDATED PACKAGES');
      lines.push('-'.repeat(25));
      
      for (const pkg of report.outdatedPackages) {
        const typeIcon = this.getPackageTypeIcon(pkg.type);
        lines.push(`${typeIcon} ${pkg.name}`);
        lines.push(`   Current: ${pkg.currentVersion}`);
        lines.push(`   Latest:  ${pkg.latestVersion}`);
      }
      lines.push('');
    }

    // Peer Conflicts Section
    if (report.peerConflicts.length > 0) {
      lines.push('🔗 PEER DEPENDENCY CONFLICTS');
      lines.push('-'.repeat(35));
      
      for (const conflict of report.peerConflicts) {
        lines.push(`⚠️  ${conflict.packageName}`);
        lines.push(`   Required by: ${conflict.requiredBy.join(', ')}`);
        lines.push(`   Conflicting versions: ${conflict.conflictingVersions.join(', ')}`);
        if (conflict.suggestedResolution) {
          lines.push(`   💡 Suggestion: ${conflict.suggestedResolution}`);
        }
        lines.push('');
      }
    }

    // Recommendations Section
    if (report.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS');
      lines.push('-'.repeat(25));
      
      const groupedByPriority = this.groupRecommendationsByPriority(report.recommendations);
      
      for (const priority of ['critical', 'high', 'medium', 'low']) {
        const recs = groupedByPriority[priority];
        if (recs && recs.length > 0) {
          const priorityIcon = this.getPriorityIcon(priority);
          lines.push(`${priorityIcon} ${priority.toUpperCase()} PRIORITY`);
          
          for (const rec of recs) {
            lines.push(`  • ${rec.description}`);
            if (rec.commands && rec.commands.length > 0) {
              lines.push(`    Commands: ${rec.commands.join(' && ')}`);
            }
          }
          lines.push('');
        }
      }
    }

    // Footer
    lines.push('='.repeat(60));
    lines.push('Report generated by DepMender');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Formats the health report as JSON
   */
  formatForJSON(report: HealthReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generates report summary from analysis results
   */
  private generateSummary(analysis: AnalysisResult): ReportSummary {
    const criticalIssues = this.countCriticalIssues(analysis.issues, analysis.securityVulnerabilities);
    
    return {
      totalPackages: this.estimateTotalPackages(analysis),
      issuesFound: analysis.issues.length,
      criticalIssues,
      securityVulnerabilities: analysis.securityVulnerabilities.length,
      healthScore: analysis.healthScore
    };
  }

  /**
   * Extracts outdated packages from dependency issues
   */
  private extractOutdatedPackages(issues: DependencyIssue[]): OutdatedPackage[] {
    return issues
      .filter(issue => issue.type === IssueType.OUTDATED && issue.latestVersion)
      .map(issue => ({
        name: issue.packageName,
        currentVersion: issue.currentVersion || 'unknown',
        latestVersion: issue.latestVersion!,
        type: 'dependency' as const // Default type, could be enhanced with more context
      }));
  }

  /**
   * Extracts peer conflicts from dependency issues
   */
  private extractPeerConflicts(issues: DependencyIssue[]): PeerConflict[] {
    const peerIssues = issues.filter(issue => issue.type === IssueType.PEER_CONFLICT);
    const conflictMap = new Map<string, PeerConflict>();

    for (const issue of peerIssues) {
      const existing = conflictMap.get(issue.packageName);
      if (existing) {
        // Merge conflict information
        if (issue.currentVersion && !existing.conflictingVersions.includes(issue.currentVersion)) {
          existing.conflictingVersions.push(issue.currentVersion);
        }
      } else {
        conflictMap.set(issue.packageName, {
          packageName: issue.packageName,
          requiredBy: ['unknown'], // Could be enhanced with more context
          conflictingVersions: issue.currentVersion ? [issue.currentVersion] : [],
          suggestedResolution: this.generatePeerConflictSuggestion(issue)
        });
      }
    }

    return Array.from(conflictMap.values());
  }

  /**
   * Generates recommendations based on analysis results
   */
  private generateRecommendations(analysis: AnalysisResult): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Security recommendations (highest priority)
    const criticalSecurity = analysis.securityVulnerabilities.filter(
      issue => issue.severity === SecuritySeverity.CRITICAL
    );
    
    if (criticalSecurity.length > 0) {
      recommendations.push({
        type: 'update',
        description: `Update ${criticalSecurity.length} critical security vulnerabilities immediately`,
        priority: 'critical',
        commands: criticalSecurity
          .filter(issue => issue.fixedIn)
          .map(issue => `npm update ${issue.packageName}@${issue.fixedIn}`)
      });
    }

    // High severity security recommendations
    const highSecurity = analysis.securityVulnerabilities.filter(
      issue => issue.severity === SecuritySeverity.HIGH
    );
    
    if (highSecurity.length > 0) {
      recommendations.push({
        type: 'update',
        description: `Update ${highSecurity.length} high severity security vulnerabilities`,
        priority: 'high',
        commands: highSecurity
          .filter(issue => issue.fixedIn)
          .map(issue => `npm update ${issue.packageName}@${issue.fixedIn}`)
      });
    }

    // Missing packages recommendations
    const missingPackages = analysis.issues.filter(issue => issue.type === IssueType.MISSING);
    if (missingPackages.length > 0) {
      recommendations.push({
        type: 'install',
        description: `Install ${missingPackages.length} missing packages`,
        priority: 'high',
        commands: [`${this.getPackageManagerCommand(analysis.packageManager)} install`]
      });
    }

    // Outdated packages recommendations
    const outdatedPackages = analysis.issues.filter(issue => issue.type === IssueType.OUTDATED);
    if (outdatedPackages.length > 0) {
      const criticalOutdated = outdatedPackages.filter(issue => issue.severity === IssueSeverity.CRITICAL);
      if (criticalOutdated.length > 0) {
        recommendations.push({
          type: 'update',
          description: `Update ${criticalOutdated.length} critically outdated packages`,
          priority: 'high'
        });
      } else {
        recommendations.push({
          type: 'update',
          description: `Consider updating ${outdatedPackages.length} outdated packages`,
          priority: 'medium'
        });
      }
    }

    // Peer conflict recommendations
    const peerConflicts = analysis.issues.filter(issue => issue.type === IssueType.PEER_CONFLICT);
    if (peerConflicts.length > 0) {
      recommendations.push({
        type: 'resolve-conflict',
        description: `Resolve ${peerConflicts.length} peer dependency conflicts`,
        priority: 'medium'
      });
    }

    return recommendations;
  }

  /**
   * Counts critical issues across all categories
   */
  private countCriticalIssues(issues: DependencyIssue[], securityIssues: SecurityIssue[]): number {
    const criticalDependencyIssues = issues.filter(issue => issue.severity === IssueSeverity.CRITICAL).length;
    const criticalSecurityIssues = securityIssues.filter(issue => issue.severity === SecuritySeverity.CRITICAL).length;
    
    return criticalDependencyIssues + criticalSecurityIssues;
  }

  /**
   * Estimates total packages in the project
   */
  private estimateTotalPackages(analysis: AnalysisResult): number {
    // This is a rough estimate - could be enhanced with actual package counting
    return Math.max(50, analysis.issues.length * 2);
  }

  /**
   * Gets health indicator emoji/text based on score
   */
  private getHealthIndicator(score: number): string {
    if (score >= 90) return '🟢 Excellent';
    if (score >= 75) return '🟡 Good';
    if (score >= 50) return '🟠 Fair';
    if (score >= 25) return '🔴 Poor';
    return '💀 Critical';
  }

  /**
   * Gets security severity icon
   */
  private getSecuritySeverityIcon(severity: SecuritySeverity): string {
    switch (severity) {
      case SecuritySeverity.CRITICAL: return '🚨';
      case SecuritySeverity.HIGH: return '⚠️';
      case SecuritySeverity.MODERATE: return '⚡';
      case SecuritySeverity.LOW: return '💡';
      default: return '❓';
    }
  }

  /**
   * Gets package type icon
   */
  private getPackageTypeIcon(type: string): string {
    switch (type) {
      case 'dependency': return '📦';
      case 'devDependency': return '🔧';
      case 'peerDependency': return '🔗';
      case 'optionalDependency': return '📋';
      default: return '📦';
    }
  }

  /**
   * Gets priority icon
   */
  private getPriorityIcon(priority: string): string {
    switch (priority) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '💡';
      case 'low': return '📝';
      default: return '❓';
    }
  }

  /**
   * Groups security issues by severity
   */
  private groupSecurityBySeverity(issues: SecurityIssue[]): Record<string, SecurityIssue[]> {
    const grouped: Record<string, SecurityIssue[]> = {
      [SecuritySeverity.CRITICAL]: [],
      [SecuritySeverity.HIGH]: [],
      [SecuritySeverity.MODERATE]: [],
      [SecuritySeverity.LOW]: []
    };

    for (const issue of issues) {
      grouped[issue.severity].push(issue);
    }

    return grouped;
  }

  /**
   * Groups recommendations by priority
   */
  private groupRecommendationsByPriority(recommendations: Recommendation[]): Record<string, Recommendation[]> {
    const grouped: Record<string, Recommendation[]> = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    for (const rec of recommendations) {
      grouped[rec.priority].push(rec);
    }

    return grouped;
  }

  /**
   * Gets critical non-security issues for emphasis
   */
  private getCriticalNonSecurityIssues(report: HealthReport): string[] {
    // This would extract critical issues from other categories
    // For now, return a placeholder
    return [];
  }

  /**
   * Generates peer conflict suggestion
   */
  private generatePeerConflictSuggestion(issue: DependencyIssue): string {
    return `Consider installing compatible version of ${issue.packageName}`;
  }

  /**
   * Gets package manager command prefix
   */
  private getPackageManagerCommand(packageManager: string): string {
    switch (packageManager) {
      case 'yarn': return 'yarn';
      case 'pnpm': return 'pnpm';
      default: return 'npm';
    }
  }
}