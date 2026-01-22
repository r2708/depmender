import { 
  DependencyAnalyzer as IDependencyAnalyzer,
  AnalysisResult,
  HealthReport,
  FixSuggestion,
  FixResult,
  ProjectInfo,
  PackageManagerType,
  DependencyIssue,
  SecurityIssue,
  IssueType,
  IssueSeverity,
  SecuritySeverity,
  HealthScoreFactors,
  ScanResult
} from './types';
import { ScannerRegistry } from '../scanners/ScannerRegistry';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { 
  OutdatedScanner,
  MissingScanner,
  VersionMismatchScanner,
  BrokenScanner,
  PeerConflictScanner,
  SecurityScanner
} from '../scanners';
import { HealthReporter } from '../reporters';
import { SuggestionEngine } from '../fixers/SuggestionEngine';
import { logger } from '../utils/Logger';

/**
 * Main dependency analyzer that orchestrates all scanners and calculates health scores
 */
export class DependencyAnalyzer implements IDependencyAnalyzer {
  private scannerRegistry: ScannerRegistry;
  private healthReporter: HealthReporter;
  private suggestionEngine: SuggestionEngine;
  private logger = logger.child('DependencyAnalyzer');

  constructor() {
    this.scannerRegistry = new ScannerRegistry();
    this.healthReporter = new HealthReporter();
    this.suggestionEngine = new SuggestionEngine();
    this.initializeScanners();
  }

  /**
   * Initialize all available scanners
   */
  private initializeScanners(): void {
    this.logger.debug('Initializing scanners');
    
    this.scannerRegistry.register(new OutdatedScanner());
    this.scannerRegistry.register(new MissingScanner());
    this.scannerRegistry.register(new VersionMismatchScanner());
    this.scannerRegistry.register(new BrokenScanner());
    this.scannerRegistry.register(new PeerConflictScanner());
    this.scannerRegistry.register(new SecurityScanner());
  }

  /**
   * Analyzes a project and returns comprehensive analysis results
   */
  async analyze(projectPath: string): Promise<AnalysisResult> {
    try {
      // Create scan context
      this.logger.debug('Creating scan context');
      const context = await ScanContextFactory.createContext(projectPath);
      
      // Run all scanners
      this.logger.debug('Running all scanners');
      const scanResults = await this.scannerRegistry.runAllScanners(context);
      
      // Aggregate results with deduplication and validation
      this.logger.debug('Aggregating scan results');
      const aggregatedResults = this.aggregateResults(scanResults);

      // Create project info
      const projectInfo: ProjectInfo = {
        name: context.packageJson.name,
        version: context.packageJson.version,
        path: projectPath,
        packageManager: context.packageManager.getType()
      };

      // Calculate health score
      this.logger.debug('Calculating health score');
      const healthScore = this.calculateHealthScore(
        aggregatedResults.issues, 
        aggregatedResults.securityVulnerabilities
      );

      const result: AnalysisResult = {
        healthScore,
        issues: aggregatedResults.issues,
        packageManager: context.packageManager.getType(),
        projectInfo,
        securityVulnerabilities: aggregatedResults.securityVulnerabilities
      };

      return result;
    } catch (error) {
      this.logger.error('Analysis failed', error instanceof Error ? error : undefined);
      throw new Error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Aggregates results from all scanners with deduplication and validation
   */
  private aggregateResults(scanResults: ScanResult[]): {
    issues: DependencyIssue[];
    securityVulnerabilities: SecurityIssue[];
  } {
    this.logger.debug('Starting result aggregation');
    
    const issues: DependencyIssue[] = [];
    const securityVulnerabilities: SecurityIssue[] = [];
    const seenIssues = new Set<string>();
    const seenVulnerabilities = new Set<string>();

    for (const result of scanResults) {
      // Validate scan result structure
      if (!result || !Array.isArray(result.issues)) {
        this.logger.warn(`Invalid scan result from ${result?.scannerType || 'unknown'} scanner`);
        continue;
      }

      this.logger.debug(`Processing ${result.issues.length} issues from ${result.scannerType} scanner`);

      // Aggregate dependency issues with deduplication
      for (const issue of result.issues) {
        if (this.isValidDependencyIssue(issue)) {
          const issueKey = this.createIssueKey(issue);
          if (!seenIssues.has(issueKey)) {
            issues.push(issue);
            seenIssues.add(issueKey);
          } else {
            this.logger.verbose(`Duplicate issue filtered: ${issueKey}`);
          }
        } else {
          this.logger.warn(`Invalid dependency issue found`, { issue });
        }
      }

      // Aggregate security vulnerabilities with deduplication
      if (result.securityIssues && Array.isArray(result.securityIssues)) {
        this.logger.debug(`Processing ${result.securityIssues.length} security issues from ${result.scannerType} scanner`);
        
        for (const vulnerability of result.securityIssues) {
          if (this.isValidSecurityIssue(vulnerability)) {
            const vulnKey = this.createVulnerabilityKey(vulnerability);
            if (!seenVulnerabilities.has(vulnKey)) {
              securityVulnerabilities.push(vulnerability);
              seenVulnerabilities.add(vulnKey);
            } else {
              this.logger.verbose(`Duplicate vulnerability filtered: ${vulnKey}`);
            }
          } else {
            this.logger.warn(`Invalid security vulnerability found`, { vulnerability });
          }
        }
      }
    }

    // Sort issues by severity (critical first)
    issues.sort((a, b) => this.compareSeverity(a.severity, b.severity));
    securityVulnerabilities.sort((a, b) => this.compareSecuritySeverity(a.severity, b.severity));

    this.logger.debug(`Aggregation complete: ${issues.length} issues, ${securityVulnerabilities.length} vulnerabilities`);
    return { issues, securityVulnerabilities };
  }

  /**
   * Validates a dependency issue structure
   */
  private isValidDependencyIssue(issue: any): issue is DependencyIssue {
    if (!issue || typeof issue !== 'object') {
      return false;
    }
    
    return (
      typeof issue.type === 'string' &&
      typeof issue.packageName === 'string' &&
      typeof issue.severity === 'string' &&
      typeof issue.description === 'string' &&
      typeof issue.fixable === 'boolean' &&
      Object.values(IssueType).includes(issue.type) &&
      Object.values(IssueSeverity).includes(issue.severity)
    );
  }

  /**
   * Validates a security issue structure
   */
  private isValidSecurityIssue(issue: any): issue is SecurityIssue {
    if (!issue || typeof issue !== 'object') {
      return false;
    }
    
    return (
      typeof issue.packageName === 'string' &&
      typeof issue.version === 'string' &&
      typeof issue.severity === 'string' &&
      typeof issue.patchAvailable === 'boolean' &&
      issue.vulnerability &&
      typeof issue.vulnerability === 'object' &&
      typeof issue.vulnerability.id === 'string' &&
      typeof issue.vulnerability.title === 'string' &&
      Object.values(SecuritySeverity).includes(issue.severity)
    );
  }

  /**
   * Creates a unique key for a dependency issue to enable deduplication
   */
  private createIssueKey(issue: DependencyIssue): string {
    return `${issue.type}:${issue.packageName}:${issue.currentVersion || 'unknown'}:${issue.expectedVersion || 'unknown'}`;
  }

  /**
   * Creates a unique key for a security vulnerability to enable deduplication
   */
  private createVulnerabilityKey(vulnerability: SecurityIssue): string {
    return `${vulnerability.packageName}:${vulnerability.version}:${vulnerability.vulnerability.id}`;
  }

  /**
   * Compares dependency issue severities for sorting (critical first)
   */
  private compareSeverity(a: IssueSeverity, b: IssueSeverity): number {
    const severityOrder = {
      [IssueSeverity.CRITICAL]: 0,
      [IssueSeverity.HIGH]: 1,
      [IssueSeverity.MEDIUM]: 2,
      [IssueSeverity.LOW]: 3
    };
    return severityOrder[a] - severityOrder[b];
  }

  /**
   * Compares security issue severities for sorting (critical first)
   */
  private compareSecuritySeverity(a: SecuritySeverity, b: SecuritySeverity): number {
    const severityOrder = {
      [SecuritySeverity.CRITICAL]: 0,
      [SecuritySeverity.HIGH]: 1,
      [SecuritySeverity.MODERATE]: 2,
      [SecuritySeverity.LOW]: 3
    };
    return severityOrder[a] - severityOrder[b];
  }

  /**
   * Calculates health score based on detected issues
   * Score ranges from 0-100, with 100 being perfect health
   */
  private calculateHealthScore(issues: DependencyIssue[], securityIssues: SecurityIssue[]): number {
    let score = 100;

    // Count issues by type and severity
    const factors = this.categorizeIssues(issues, securityIssues);

    // Apply weighted deductions based on health score factors
    // Security issues: Weight 40%
    score -= factors.securityIssues * 0.4;
    
    // Missing packages: Weight 15%
    score -= factors.missingPackages * 0.15;
    
    // Peer conflicts: Weight 15%
    score -= factors.peerConflicts * 0.15;
    
    // Outdated packages: Weight 20%
    score -= factors.outdatedPackages * 0.2;
    
    // Broken installations: Weight 10%
    score -= factors.brokenInstallations * 0.1;

    // Ensure score stays within bounds
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Categorizes issues into health score factors with severity-based scoring
   */
  private categorizeIssues(issues: DependencyIssue[], securityIssues: SecurityIssue[]): HealthScoreFactors {
    const factors: HealthScoreFactors = {
      outdatedPackages: 0,
      securityIssues: 0,
      peerConflicts: 0,
      missingPackages: 0,
      brokenInstallations: 0
    };

    // Process dependency issues
    for (const issue of issues) {
      const severityMultiplier = this.getSeverityMultiplier(issue.severity);
      
      switch (issue.type) {
        case IssueType.OUTDATED:
          factors.outdatedPackages += severityMultiplier;
          break;
        case IssueType.MISSING:
          factors.missingPackages += severityMultiplier;
          break;
        case IssueType.PEER_CONFLICT:
          factors.peerConflicts += severityMultiplier;
          break;
        case IssueType.BROKEN:
          factors.brokenInstallations += severityMultiplier;
          break;
        case IssueType.VERSION_MISMATCH:
          // Version mismatches contribute to outdated packages score
          factors.outdatedPackages += severityMultiplier * 0.5;
          break;
        case IssueType.SECURITY:
          // Security issues are handled separately below
          break;
      }
    }

    // Process security issues with higher impact
    for (const securityIssue of securityIssues) {
      const severityMultiplier = this.getSecuritySeverityMultiplier(securityIssue.severity);
      factors.securityIssues += severityMultiplier;
    }

    return factors;
  }

  /**
   * Gets severity multiplier for dependency issues
   */
  private getSeverityMultiplier(severity: IssueSeverity): number {
    switch (severity) {
      case IssueSeverity.CRITICAL:
        return 20;
      case IssueSeverity.HIGH:
        return 10;
      case IssueSeverity.MEDIUM:
        return 5;
      case IssueSeverity.LOW:
        return 2;
      default:
        return 1;
    }
  }

  /**
   * Gets severity multiplier for security issues (higher impact)
   */
  private getSecuritySeverityMultiplier(severity: SecuritySeverity): number {
    switch (severity) {
      case SecuritySeverity.CRITICAL:
        return 50;
      case SecuritySeverity.HIGH:
        return 25;
      case SecuritySeverity.MODERATE:
        return 10;
      case SecuritySeverity.LOW:
        return 5;
      default:
        return 1;
    }
  }

  /**
   * Generates a health report from analysis results
   */
  async generateReport(analysis: AnalysisResult): Promise<HealthReport> {
    return await this.healthReporter.generateReport(analysis);
  }

  /**
   * Suggests fixes for detected issues
   */
  async suggestFixes(analysis: AnalysisResult): Promise<FixSuggestion[]> {
    return await this.suggestionEngine.generateSuggestions(analysis);
  }

  /**
   * Applies fixes to the project using the AutoFixer
   */
  async applyFixes(fixes: FixSuggestion[]): Promise<FixResult> {
    // This method is not typically called directly - the FixCommand handles this
    // But we provide a basic implementation for completeness
    throw new Error('applyFixes should be called through the FixCommand, not directly on DependencyAnalyzer');
  }

  /**
   * Gets the scanner registry (for testing and advanced usage)
   */
  getScannerRegistry(): ScannerRegistry {
    return this.scannerRegistry;
  }
}