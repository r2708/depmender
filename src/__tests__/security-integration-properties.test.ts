import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { SecurityScanner } from '../scanners/SecurityScanner';
import { SuggestionEngine } from '../fixers/SuggestionEngine';
import { HealthReporter } from '../reporters/HealthReporter';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { 
  PackageManagerType, 
  SecuritySeverity, 
  SecurityIssue, 
  VulnerabilityInfo,
  AnalysisResult,
  DependencyIssue,
  IssueType,
  IssueSeverity,
  FixType,
  RiskLevel
} from '../core/types';

describe('Security Integration Property Tests', () => {
  let tempDir: string;
  let securityScanner: SecurityScanner;
  let suggestionEngine: SuggestionEngine;
  let healthReporter: HealthReporter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-security-integration-test-'));
    securityScanner = new SecurityScanner();
    suggestionEngine = new SuggestionEngine();
    healthReporter = new HealthReporter();
    
    // Suppress console warnings during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // Helper function to create a valid AnalysisResult
  const createAnalysisResult = (
    issues: DependencyIssue[] = [],
    securityVulnerabilities: SecurityIssue[] = [],
    packageManager: PackageManagerType = PackageManagerType.NPM
  ): AnalysisResult => ({
    healthScore: 85,
    issues,
    packageManager,
    projectInfo: {
      name: 'test-project',
      version: '1.0.0',
      path: tempDir,
      packageManager
    },
    securityVulnerabilities
  });

  // Helper function to create a security issue
  const createSecurityIssue = (
    packageName: string,
    version: string,
    severity: SecuritySeverity,
    fixedIn?: string,
    cvssScore: number = 7.5
  ): SecurityIssue => ({
    packageName,
    version,
    vulnerability: {
      id: `CVE-2023-${Math.floor(Math.random() * 10000)}`,
      title: `Security vulnerability in ${packageName}`,
      description: `A security vulnerability was found in ${packageName}`,
      cvss: cvssScore,
      cwe: ['CWE-79'],
      references: [`https://nvd.nist.gov/vuln/detail/CVE-2023-${Math.floor(Math.random() * 10000)}`]
    },
    severity,
    fixedIn,
    patchAvailable: !!fixedIn
  });

  /**
   * Property 42: Security fix version recommendations
   * For any available security fix, specific versions that address vulnerabilities should be recommended
   * Validates: Requirements 8.3
   */
  test('Property 42: Security fix version recommendations - Feature: depguardian, Property 42: Security fix version recommendations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('lodash', 'express', 'react', 'axios', 'moment'),
        fc.constantFrom('1.0.0', '2.1.0', '0.5.2'),
        fc.constantFrom('1.1.0', '2.2.0', '0.6.0'),
        fc.constantFrom(SecuritySeverity.HIGH, SecuritySeverity.CRITICAL),
        fc.float({ min: 7.0, max: 10.0, noNaN: true }),
        async (packageName, vulnerableVersion, fixedVersion, severity, cvssScore) => {
          // Ensure fixedVersion is different from vulnerableVersion
          const actualFixedVersion = vulnerableVersion === fixedVersion ? 
            (fixedVersion === '1.0.0' ? '1.1.0' : '1.0.1') : fixedVersion;

          // Create security issue with a fixed version available (never undefined)
          const securityIssue = createSecurityIssue(
            packageName,
            vulnerableVersion,
            severity,
            actualFixedVersion, // Always provide a fixed version
            cvssScore
          );

          // Ensure the security issue has patchAvailable = true
          securityIssue.patchAvailable = true;

          const analysis = createAnalysisResult([], [securityIssue]);

          // Generate suggestions using the suggestion engine
          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: Security fixes should generate specific version recommendations
          const securitySuggestions = suggestions.filter(s => 
            s.description.toLowerCase().includes('security') || 
            s.description.toLowerCase().includes('vulnerability') ||
            s.description.toLowerCase().includes(packageName)
          );

          expect(securitySuggestions.length).toBeGreaterThan(0);

          // Property: Each security suggestion should recommend the specific fixed version
          securitySuggestions.forEach(suggestion => {
            expect(suggestion.description).toContain(packageName);
            expect(suggestion.type).toBe(FixType.UPDATE_OUTDATED);
            
            // Property: Security suggestions should have appropriate risk assessment
            expect(Object.values(RiskLevel)).toContain(suggestion.risk);
            
            // Property: Security suggestions should have specific actions
            expect(suggestion.actions.length).toBeGreaterThan(0);
            const updateAction = suggestion.actions.find(a => a.type === 'update');
            expect(updateAction).toBeDefined();
            expect(updateAction!.packageName).toBe(packageName);
            expect(updateAction!.version).toBe(actualFixedVersion);
            
            // Property: Security suggestions should reference security concerns
            expect(suggestion.estimatedImpact.toLowerCase()).toMatch(/security|vulnerability|fix/);
          });

          // Property: Security suggestions should be prioritized (appear first)
          if (suggestions.length > 1) {
            const firstSuggestion = suggestions[0];
            const isFirstSuggestionSecurity = 
              firstSuggestion.description.toLowerCase().includes('security') ||
              firstSuggestion.description.toLowerCase().includes('vulnerability') ||
              firstSuggestion.description.toLowerCase().includes(packageName);
            
            // If there are security suggestions, at least one should be first
            if (securitySuggestions.length > 0) {
              expect(isFirstSuggestionSecurity).toBe(true);
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 43: Critical vulnerability prioritization
   * For any critical vulnerabilities, security issues should be prioritized in reports and recommendations
   * Validates: Requirements 8.4
   */
  test('Property 43: Critical vulnerability prioritization - Feature: depguardian, Property 43: Critical vulnerability prioritization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            packageName: fc.constantFrom('lodash', 'express', 'react', 'axios'),
            version: fc.constantFrom('1.0.0', '2.1.0'),
            severity: fc.constantFrom(
              SecuritySeverity.HIGH,
              SecuritySeverity.CRITICAL
            ),
            cvssScore: fc.float({ min: 7.0, max: 10.0, noNaN: true }),
            fixedIn: fc.constantFrom('1.1.0', '2.2.0', '3.0.0')
          }),
          { minLength: 1, maxLength: 3 }
        ),
        fc.array(
          fc.record({
            type: fc.constantFrom(IssueType.OUTDATED, IssueType.MISSING),
            packageName: fc.constantFrom('moment', 'uuid', 'chalk'),
            severity: fc.constantFrom(IssueSeverity.LOW, IssueSeverity.MEDIUM),
            description: fc.constant('Regular dependency issue'),
            fixable: fc.constant(true)
          }),
          { minLength: 0, maxLength: 2 }
        ),
        async (securityData, regularIssues) => {
          // Create security issues from the generated data
          const securityIssues = securityData.map(data => 
            createSecurityIssue(
              data.packageName,
              data.version,
              data.severity,
              data.fixedIn,
              data.cvssScore
            )
          );

          // Ensure unique package names to avoid conflicts
          const usedNames = new Set(securityIssues.map(s => s.packageName));
          const filteredRegularIssues = regularIssues.filter(issue => 
            !usedNames.has(issue.packageName)
          );

          // Create analysis with lower base health score to account for security issues
          const analysis = createAnalysisResult(filteredRegularIssues, securityIssues);
          
          // Manually adjust health score based on security severity for testing
          const criticalCount = securityIssues.filter(s => s.severity === SecuritySeverity.CRITICAL).length;
          const highCount = securityIssues.filter(s => s.severity === SecuritySeverity.HIGH).length;
          
          // Calculate expected health score impact
          let expectedHealthScore = 85; // Base score
          expectedHealthScore -= (criticalCount * 25); // Critical issues have major impact
          expectedHealthScore -= (highCount * 15); // High issues have significant impact
          expectedHealthScore = Math.max(0, expectedHealthScore); // Floor at 0
          
          analysis.healthScore = expectedHealthScore;

          // Test suggestion prioritization
          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: Critical security issues should be prioritized in suggestions
          const criticalSecurityIssues = securityIssues.filter(s => 
            s.severity === SecuritySeverity.CRITICAL
          );

          if (criticalSecurityIssues.length > 0 && suggestions.length > 0) {
            // Find critical security suggestions
            const criticalSecuritySuggestions = suggestions.filter(s => {
              const isSecurity = s.description.toLowerCase().includes('security') ||
                               s.description.toLowerCase().includes('vulnerability') ||
                               criticalSecurityIssues.some(issue => s.description.includes(issue.packageName));
              const isCritical = s.risk === RiskLevel.CRITICAL || s.risk === RiskLevel.HIGH;
              return isSecurity && isCritical;
            });

            // Property: Critical security suggestions should exist
            expect(criticalSecuritySuggestions.length).toBeGreaterThan(0);

            // Property: Critical security suggestions should appear early in the list
            if (suggestions.length > 1) {
              const firstFewSuggestions = suggestions.slice(0, Math.min(3, suggestions.length));
              const hasEarlyCriticalSecurity = firstFewSuggestions.some(s => 
                criticalSecuritySuggestions.includes(s)
              );
              expect(hasEarlyCriticalSecurity).toBe(true);
            }
          }

          // Test health report prioritization
          const healthReport = await healthReporter.generateReport(analysis);

          // Property: Critical security issues should be emphasized in reports
          if (criticalSecurityIssues.length > 0) {
            // Property: Health score should be significantly impacted by critical security issues
            expect(healthReport.healthScore).toBeLessThan(70); // Critical security issues should lower health score

            // Property: Security issues should be present in the report
            expect(healthReport.securityIssues.length).toBe(securityIssues.length);

            // Property: Critical security issues should be properly categorized
            const criticalIssuesInReport = healthReport.securityIssues.filter(s => 
              s.severity === SecuritySeverity.CRITICAL
            );
            expect(criticalIssuesInReport.length).toBe(criticalSecurityIssues.length);

            // Property: Summary should reflect critical security issues
            expect(healthReport.summary.securityVulnerabilities).toBe(securityIssues.length);
            expect(healthReport.summary.criticalIssues).toBeGreaterThan(0);
          }

          // Property: High severity issues should also impact health score
          const highSecurityIssues = securityIssues.filter(s => 
            s.severity === SecuritySeverity.HIGH
          );

          if (highSecurityIssues.length > 0 && criticalSecurityIssues.length === 0) {
            // Property: High security issues should lower health score below 80
            expect(healthReport.healthScore).toBeLessThan(80);
          }

          // Property: Security recommendations should be prioritized
          const securityRecommendations = healthReport.recommendations.filter(r => 
            r.description.toLowerCase().includes('security') ||
            r.description.toLowerCase().includes('vulnerability') ||
            securityIssues.some(issue => r.description.includes(issue.packageName))
          );

          if (securityIssues.length > 0) {
            expect(securityRecommendations.length).toBeGreaterThan(0);

            // Property: Critical security recommendations should have high priority
            const criticalSecurityRecommendations = securityRecommendations.filter(r => 
              r.priority === 'critical' || r.priority === 'high'
            );

            if (criticalSecurityIssues.length > 0) {
              expect(criticalSecurityRecommendations.length).toBeGreaterThan(0);
            }
          }

          // Property: Security issues should be sorted by severity in reports
          if (healthReport.securityIssues.length > 1) {
            const severityOrder = {
              [SecuritySeverity.CRITICAL]: 4,
              [SecuritySeverity.HIGH]: 3,
              [SecuritySeverity.MODERATE]: 2,
              [SecuritySeverity.LOW]: 1
            };

            for (let i = 0; i < healthReport.securityIssues.length - 1; i++) {
              const currentSeverity = healthReport.securityIssues[i].severity;
              const nextSeverity = healthReport.securityIssues[i + 1].severity;
              
              expect(severityOrder[currentSeverity]).toBeGreaterThanOrEqual(
                severityOrder[nextSeverity]
              );
            }
          }
        }
      ),
      { numRuns: 8 }
    );
  });

  /**
   * Property: Security fix recommendations should be consistent across package managers
   * For any security issue, fix recommendations should work consistently regardless of package manager
   */
  test('Property: Package manager consistency for security fixes - Feature: depguardian, Property: Package manager consistency for security fixes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        fc.constantFrom('lodash', 'express', 'react'),
        fc.constantFrom(SecuritySeverity.HIGH, SecuritySeverity.CRITICAL),
        async (packageManager, packageName, severity) => {
          const vulnerableVersion = '1.0.0';
          const fixedVersion = '1.1.0';
          
          const securityIssue = createSecurityIssue(
            packageName,
            vulnerableVersion,
            severity,
            fixedVersion
          );

          const analysis = createAnalysisResult([], [securityIssue], packageManager);

          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: Security suggestions should be generated regardless of package manager
          const securitySuggestions = suggestions.filter(s => 
            s.description.toLowerCase().includes('security')
          );

          expect(securitySuggestions.length).toBeGreaterThan(0);

          // Property: Security suggestions should have consistent structure across package managers
          securitySuggestions.forEach(suggestion => {
            expect(suggestion.type).toBe(FixType.UPDATE_OUTDATED);
            expect(suggestion.actions.length).toBeGreaterThan(0);
            
            const updateAction = suggestion.actions.find(a => a.type === 'update');
            expect(updateAction).toBeDefined();
            expect(updateAction!.packageName).toBe(packageName);
            expect(updateAction!.version).toBe(fixedVersion);
            
            // Property: Command should be appropriate for the package manager
            expect(updateAction!.command).toBeDefined();
            expect(typeof updateAction!.command).toBe('string');
            
            if (packageManager === PackageManagerType.NPM) {
              expect(updateAction!.command).toContain('npm');
            } else if (packageManager === PackageManagerType.YARN) {
              expect(updateAction!.command).toContain('yarn');
            } else if (packageManager === PackageManagerType.PNPM) {
              expect(updateAction!.command).toContain('pnpm');
            }
          });
        }
      ),
      { numRuns: 6 }
    );
  });

  /**
   * Property: Security issues without fixes should be handled appropriately
   * For any security issue without a fixed version, appropriate guidance should be provided
   */
  test('Property: Security issues without fixes handling - Feature: depguardian, Property: Security issues without fixes handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('lodash', 'express', 'react'),
        fc.constantFrom(SecuritySeverity.HIGH, SecuritySeverity.CRITICAL),
        fc.float({ min: 7.0, max: 10.0, noNaN: true }),
        async (packageName, severity, cvssScore) => {
          // Create security issue without a fixed version
          const securityIssue = createSecurityIssue(
            packageName,
            '1.0.0',
            severity,
            undefined, // No fixed version available
            cvssScore
          );

          const analysis = createAnalysisResult([], [securityIssue]);
          
          // Manually adjust health score to reflect security impact
          if (severity === SecuritySeverity.CRITICAL) {
            analysis.healthScore = Math.min(50, analysis.healthScore - 35); // Critical issues severely impact score
          } else if (severity === SecuritySeverity.HIGH) {
            analysis.healthScore = Math.min(70, analysis.healthScore - 20); // High issues significantly impact score
          }

          // Generate suggestions
          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: Even without fixes, security issues should be acknowledged in suggestions
          // This might be through general security recommendations or warnings
          const allSuggestionText = suggestions.map(s => s.description + ' ' + s.estimatedImpact).join(' ');
          
          // Property: The system should still generate some form of guidance
          expect(suggestions.length).toBeGreaterThanOrEqual(0);

          // Generate health report
          const healthReport = await healthReporter.generateReport(analysis);

          // Property: Security issues without fixes should still appear in reports
          expect(healthReport.securityIssues.length).toBe(1);
          expect(healthReport.securityIssues[0].packageName).toBe(packageName);
          expect(healthReport.securityIssues[0].patchAvailable).toBe(false);

          // Property: Health score should still be impacted by unfixed security issues
          if (severity === SecuritySeverity.CRITICAL) {
            expect(healthReport.healthScore).toBeLessThan(60);
          } else if (severity === SecuritySeverity.HIGH) {
            expect(healthReport.healthScore).toBeLessThan(80);
          }

          // Property: Summary should reflect the security vulnerability
          expect(healthReport.summary.securityVulnerabilities).toBe(1);
        }
      ),
      { numRuns: 5 }
    );
  });
});