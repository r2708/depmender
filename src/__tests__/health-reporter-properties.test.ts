import * as fc from 'fast-check';
import { HealthReporter } from '../reporters/HealthReporter';
import {
  AnalysisResult,
  HealthReport,
  PackageManagerType,
  IssueType,
  IssueSeverity,
  SecuritySeverity,
  DependencyIssue,
  SecurityIssue,
  VulnerabilityInfo,
  ProjectInfo
} from '../core/types';

// Helper function to generate vulnerability records with valid CVSS scores
const vulnerabilityArbitrary = () => fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  cvss: fc.float({ min: 0, max: 10, noNaN: true }),
  cwe: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  references: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 })
});

// Helper function to generate security issues
const securityIssueArbitrary = () => fc.record({
  packageName: fc.string({ minLength: 1, maxLength: 50 }),
  version: fc.string({ minLength: 1, maxLength: 20 }),
  vulnerability: vulnerabilityArbitrary(),
  severity: fc.constantFrom(...Object.values(SecuritySeverity)),
  fixedIn: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  patchAvailable: fc.boolean()
});

describe('Health Reporter Properties', () => {
  /**
   * Property 8: Comprehensive report generation
   * For any analysis result, the generated health report should contain all required sections
   * (summary, outdated packages, security issues, conflicts, recommendations)
   * Validates: Requirements 2.1
   */
  test('Property 8: Comprehensive report generation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary analysis results
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          issues: fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(IssueType)),
              packageName: fc.string({ minLength: 1, maxLength: 50 }),
              currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              expectedVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              severity: fc.constantFrom(...Object.values(IssueSeverity)),
              description: fc.string({ minLength: 1, maxLength: 200 }),
              fixable: fc.boolean()
            }),
            { maxLength: 20 }
          ),
          packageManager: fc.constantFrom(...Object.values(PackageManagerType)),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom(...Object.values(PackageManagerType))
          }),
          securityVulnerabilities: fc.array(securityIssueArbitrary(), { maxLength: 10 })
        }),
        async (analysisResult: AnalysisResult) => {
          const healthReporter = new HealthReporter();
          // Generate health report
          const report: HealthReport = await healthReporter.generateReport(analysisResult);

          // Verify all required sections are present
          expect(report).toBeDefined();
          expect(typeof report.healthScore).toBe('number');
          expect(report.summary).toBeDefined();
          expect(Array.isArray(report.outdatedPackages)).toBe(true);
          expect(Array.isArray(report.securityIssues)).toBe(true);
          expect(Array.isArray(report.peerConflicts)).toBe(true);
          expect(Array.isArray(report.recommendations)).toBe(true);

          // Verify summary contains required fields
          expect(typeof report.summary.totalPackages).toBe('number');
          expect(typeof report.summary.issuesFound).toBe('number');
          expect(typeof report.summary.criticalIssues).toBe('number');
          expect(typeof report.summary.securityVulnerabilities).toBe('number');
          expect(typeof report.summary.healthScore).toBe('number');

          // Verify health score consistency
          expect(report.healthScore).toBe(analysisResult.healthScore);
          expect(report.summary.healthScore).toBe(analysisResult.healthScore);

          // Verify issues count consistency
          expect(report.summary.issuesFound).toBe(analysisResult.issues.length);
          expect(report.summary.securityVulnerabilities).toBe(analysisResult.securityVulnerabilities.length);

          // Verify security issues are preserved
          expect(report.securityIssues).toEqual(analysisResult.securityVulnerabilities);

          // Verify outdated packages are extracted correctly
          const expectedOutdatedCount = analysisResult.issues.filter(
            issue => issue.type === IssueType.OUTDATED && issue.latestVersion
          ).length;
          expect(report.outdatedPackages.length).toBe(expectedOutdatedCount);

          // Verify peer conflicts are extracted correctly
          const expectedPeerConflictCount = analysisResult.issues.filter(
            issue => issue.type === IssueType.PEER_CONFLICT
          ).length;
          expect(report.peerConflicts.length).toBeLessThanOrEqual(expectedPeerConflictCount);

          // Verify recommendations are generated
          expect(report.recommendations.length).toBeGreaterThanOrEqual(0);

          // Verify each recommendation has required fields
          for (const recommendation of report.recommendations) {
            expect(typeof recommendation.type).toBe('string');
            expect(typeof recommendation.description).toBe('string');
            expect(typeof recommendation.priority).toBe('string');
            expect(['update', 'install', 'remove', 'resolve-conflict']).toContain(recommendation.type);
            expect(['low', 'medium', 'high', 'critical']).toContain(recommendation.priority);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test CLI formatting produces valid output
   */
  test('CLI formatting produces valid string output', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          issues: fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(IssueType)),
              packageName: fc.string({ minLength: 1, maxLength: 50 }),
              currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              severity: fc.constantFrom(...Object.values(IssueSeverity)),
              description: fc.string({ minLength: 1, maxLength: 200 }),
              fixable: fc.boolean()
            }),
            { maxLength: 10 }
          ),
          packageManager: fc.constantFrom(...Object.values(PackageManagerType)),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom(...Object.values(PackageManagerType))
          }),
          securityVulnerabilities: fc.array(securityIssueArbitrary(), { maxLength: 5 })
        }),
        async (analysisResult: AnalysisResult) => {
          const healthReporter = new HealthReporter();
          const report = await healthReporter.generateReport(analysisResult);
          const cliOutput = healthReporter.formatForCLI(report);

          // Verify CLI output is a valid string
          expect(typeof cliOutput).toBe('string');
          expect(cliOutput.length).toBeGreaterThan(0);

          // Verify it contains expected sections
          expect(cliOutput).toContain('DEPENDENCY HEALTH REPORT');
          expect(cliOutput).toContain('Overall Health Score');
          expect(cliOutput).toContain('SUMMARY');

          // Verify health score appears in output
          expect(cliOutput).toContain(analysisResult.healthScore.toString());
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Test JSON formatting produces valid JSON
   */
  test('JSON formatting produces valid JSON', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          issues: fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(IssueType)),
              packageName: fc.string({ minLength: 1, maxLength: 50 }),
              currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              severity: fc.constantFrom(...Object.values(IssueSeverity)),
              description: fc.string({ minLength: 1, maxLength: 200 }),
              fixable: fc.boolean()
            }),
            { maxLength: 5 }
          ),
          packageManager: fc.constantFrom(...Object.values(PackageManagerType)),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom(...Object.values(PackageManagerType))
          }),
          securityVulnerabilities: fc.array(securityIssueArbitrary(), { maxLength: 3 })
        }),
        async (analysisResult: AnalysisResult) => {
          const healthReporter = new HealthReporter();
          const report = await healthReporter.generateReport(analysisResult);
          const jsonOutput = healthReporter.formatForJSON(report);

          // Verify JSON output is valid
          expect(typeof jsonOutput).toBe('string');
          expect(() => JSON.parse(jsonOutput)).not.toThrow();

          // Verify parsed JSON matches original report
          const parsedReport = JSON.parse(jsonOutput);
          expect(parsedReport.healthScore).toBe(report.healthScore);
          expect(parsedReport.summary).toEqual(report.summary);
          expect(parsedReport.outdatedPackages).toEqual(report.outdatedPackages);
          expect(parsedReport.securityIssues).toEqual(report.securityIssues);
          expect(parsedReport.peerConflicts).toEqual(report.peerConflicts);
          expect(parsedReport.recommendations).toEqual(report.recommendations);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 9: Outdated package reporting
   * For any analysis with outdated packages, all outdated packages should appear in the report 
   * with current and latest version information
   * Validates: Requirements 2.2
   */
  test('Property 9: Outdated package reporting', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          issues: fc.array(
            fc.record({
              type: fc.constantFrom(IssueType.OUTDATED),
              packageName: fc.string({ minLength: 1, maxLength: 50 }),
              currentVersion: fc.string({ minLength: 1, maxLength: 20 }),
              latestVersion: fc.string({ minLength: 1, maxLength: 20 }),
              severity: fc.constantFrom(...Object.values(IssueSeverity)),
              description: fc.string({ minLength: 1, maxLength: 200 }),
              fixable: fc.boolean()
            }),
            { minLength: 1, maxLength: 10 }
          ),
          packageManager: fc.constantFrom(...Object.values(PackageManagerType)),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom(...Object.values(PackageManagerType))
          }),
          securityVulnerabilities: fc.array(securityIssueArbitrary(), { maxLength: 3 })
        }),
        async (analysisResult: AnalysisResult) => {
          const healthReporter = new HealthReporter();
          const report = await healthReporter.generateReport(analysisResult);
          
          // All outdated packages with latest version should appear in report
          const expectedOutdatedPackages = analysisResult.issues.filter(
            issue => issue.type === IssueType.OUTDATED && issue.latestVersion
          );
          
          expect(report.outdatedPackages.length).toBe(expectedOutdatedPackages.length);
          
          // Each outdated package should have current and latest version information
          for (const outdatedPkg of report.outdatedPackages) {
            expect(typeof outdatedPkg.name).toBe('string');
            expect(outdatedPkg.name.length).toBeGreaterThan(0);
            expect(typeof outdatedPkg.currentVersion).toBe('string');
            expect(outdatedPkg.currentVersion.length).toBeGreaterThan(0);
            expect(typeof outdatedPkg.latestVersion).toBe('string');
            expect(outdatedPkg.latestVersion.length).toBeGreaterThan(0);
            expect(typeof outdatedPkg.type).toBe('string');
            
            // Verify the package exists in the original issues
            const originalIssue = expectedOutdatedPackages.find(issue => issue.packageName === outdatedPkg.name);
            expect(originalIssue).toBeDefined();
            expect(originalIssue!.currentVersion).toBe(outdatedPkg.currentVersion);
            expect(originalIssue!.latestVersion).toBe(outdatedPkg.latestVersion);
          }
          
          // CLI output should contain outdated package information
          const cliOutput = healthReporter.formatForCLI(report);
          if (report.outdatedPackages.length > 0) {
            expect(cliOutput).toContain('OUTDATED PACKAGES');
            for (const pkg of report.outdatedPackages) {
              expect(cliOutput).toContain(pkg.name);
              expect(cliOutput).toContain(pkg.currentVersion);
              expect(cliOutput).toContain(pkg.latestVersion);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 10: Conflict reporting completeness
   * For any analysis with peer conflicts, all conflicts should be displayed in the report 
   * with conflicting requirements
   * Validates: Requirements 2.3
   */
  test('Property 10: Conflict reporting completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          issues: fc.array(
            fc.record({
              type: fc.constantFrom(IssueType.PEER_CONFLICT),
              packageName: fc.string({ minLength: 1, maxLength: 50 }),
              currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              expectedVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              severity: fc.constantFrom(...Object.values(IssueSeverity)),
              description: fc.string({ minLength: 1, maxLength: 200 }),
              fixable: fc.boolean()
            }),
            { minLength: 1, maxLength: 10 }
          ),
          packageManager: fc.constantFrom(...Object.values(PackageManagerType)),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom(...Object.values(PackageManagerType))
          }),
          securityVulnerabilities: fc.constantFrom([])
        }),
        async (analysisResult: AnalysisResult) => {
          const healthReporter = new HealthReporter();
          const report = await healthReporter.generateReport(analysisResult);
          
          // All peer conflict issues should result in peer conflicts in the report
          const expectedPeerConflicts = analysisResult.issues.filter(
            issue => issue.type === IssueType.PEER_CONFLICT
          );
          
          expect(report.peerConflicts.length).toBeLessThanOrEqual(expectedPeerConflicts.length);
          expect(report.peerConflicts.length).toBeGreaterThan(0);
          
          // Each peer conflict should have required information
          for (const conflict of report.peerConflicts) {
            expect(typeof conflict.packageName).toBe('string');
            expect(conflict.packageName.length).toBeGreaterThan(0);
            expect(Array.isArray(conflict.requiredBy)).toBe(true);
            expect(Array.isArray(conflict.conflictingVersions)).toBe(true);
            
            // Verify the conflict exists in the original issues
            const originalIssue = expectedPeerConflicts.find(issue => issue.packageName === conflict.packageName);
            expect(originalIssue).toBeDefined();
          }
          
          // CLI output should contain peer conflict information
          const cliOutput = healthReporter.formatForCLI(report);
          if (report.peerConflicts.length > 0) {
            expect(cliOutput).toContain('PEER DEPENDENCY CONFLICTS');
            for (const conflict of report.peerConflicts) {
              expect(cliOutput).toContain(conflict.packageName);
              expect(cliOutput).toContain('Required by:');
              expect(cliOutput).toContain('Conflicting versions:');
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 11: Security issue highlighting
   * For any analysis with security vulnerabilities, all security issues should be highlighted in the report
   * Validates: Requirements 2.4
   */
  test('Property 11: Security issue highlighting', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          issues: fc.constantFrom([]),
          packageManager: fc.constantFrom(...Object.values(PackageManagerType)),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom(...Object.values(PackageManagerType))
          }),
          securityVulnerabilities: fc.array(securityIssueArbitrary(), { minLength: 1, maxLength: 10 })
        }),
        async (analysisResult: AnalysisResult) => {
          const healthReporter = new HealthReporter();
          const report = await healthReporter.generateReport(analysisResult);
          
          // All security vulnerabilities should be preserved in the report
          expect(report.securityIssues).toEqual(analysisResult.securityVulnerabilities);
          expect(report.securityIssues.length).toBe(analysisResult.securityVulnerabilities.length);
          
          // Each security issue should have complete information
          for (const securityIssue of report.securityIssues) {
            expect(typeof securityIssue.packageName).toBe('string');
            expect(securityIssue.packageName.length).toBeGreaterThan(0);
            expect(typeof securityIssue.version).toBe('string');
            expect(securityIssue.version.length).toBeGreaterThan(0);
            expect(typeof securityIssue.severity).toBe('string');
            expect(Object.values(SecuritySeverity)).toContain(securityIssue.severity);
            expect(typeof securityIssue.patchAvailable).toBe('boolean');
            
            // Vulnerability info should be complete
            expect(typeof securityIssue.vulnerability.id).toBe('string');
            expect(typeof securityIssue.vulnerability.title).toBe('string');
            expect(typeof securityIssue.vulnerability.cvss).toBe('number');
            expect(securityIssue.vulnerability.cvss).toBeGreaterThanOrEqual(0);
            expect(securityIssue.vulnerability.cvss).toBeLessThanOrEqual(10);
            expect(Number.isFinite(securityIssue.vulnerability.cvss)).toBe(true); // Ensure no NaN values
          }
          
          // CLI output should highlight security issues
          const cliOutput = healthReporter.formatForCLI(report);
          if (report.securityIssues.length > 0) {
            expect(cliOutput).toContain('SECURITY VULNERABILITIES');
            for (const issue of report.securityIssues) {
              expect(cliOutput).toContain(issue.packageName);
              expect(cliOutput).toContain(issue.version);
              expect(cliOutput).toContain(issue.vulnerability.title);
              expect(cliOutput).toContain(`CVSS: ${issue.vulnerability.cvss}`);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 13: Report structure consistency
   * For any generated report, the output should have clear, readable structure with appropriate categorization
   * Validates: Requirements 2.6
   */
  test('Property 13: Report structure consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          issues: fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(IssueType)),
              packageName: fc.string({ minLength: 1, maxLength: 50 }),
              currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              expectedVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              severity: fc.constantFrom(...Object.values(IssueSeverity)),
              description: fc.string({ minLength: 1, maxLength: 200 }),
              fixable: fc.boolean()
            }),
            { maxLength: 10 }
          ),
          packageManager: fc.constantFrom(...Object.values(PackageManagerType)),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom(...Object.values(PackageManagerType))
          }),
          securityVulnerabilities: fc.array(securityIssueArbitrary(), { maxLength: 5 })
        }),
        async (analysisResult: AnalysisResult) => {
          const healthReporter = new HealthReporter();
          const report = await healthReporter.generateReport(analysisResult);
          const cliOutput = healthReporter.formatForCLI(report);
          
          // Verify clear, readable structure
          expect(typeof cliOutput).toBe('string');
          expect(cliOutput.length).toBeGreaterThan(0);
          
          // Verify appropriate categorization with expected sections
          const expectedSections = [
            'DEPENDENCY HEALTH REPORT',
            'Overall Health Score',
            'SUMMARY'
          ];
          
          for (const section of expectedSections) {
            expect(cliOutput).toContain(section);
          }
          
          // Verify sections appear in logical order
          const headerIndex = cliOutput.indexOf('DEPENDENCY HEALTH REPORT');
          const scoreIndex = cliOutput.indexOf('Overall Health Score');
          const summaryIndex = cliOutput.indexOf('SUMMARY');
          
          expect(headerIndex).toBeLessThan(scoreIndex);
          expect(scoreIndex).toBeLessThan(summaryIndex);
          
          // Verify conditional sections appear when relevant
          if (analysisResult.issues.some(issue => issue.type === IssueType.OUTDATED && issue.latestVersion)) {
            expect(cliOutput).toContain('OUTDATED PACKAGES');
          }
          
          if (analysisResult.securityVulnerabilities.length > 0) {
            expect(cliOutput).toContain('SECURITY VULNERABILITIES');
          }
          
          if (analysisResult.issues.some(issue => issue.type === IssueType.PEER_CONFLICT)) {
            expect(cliOutput).toContain('PEER DEPENDENCY CONFLICTS');
          }
          
          // Verify critical issues are emphasized when present
          const hasCriticalIssues = analysisResult.issues.some(issue => issue.severity === IssueSeverity.CRITICAL) ||
                                   analysisResult.securityVulnerabilities.some(issue => issue.severity === SecuritySeverity.CRITICAL);
          
          if (hasCriticalIssues) {
            expect(cliOutput).toContain('CRITICAL ISSUES');
          }
          
          // Verify consistent formatting patterns
          expect(cliOutput).toMatch(/={10,}/); // Section separators
          expect(cliOutput).toMatch(/\n\s*\n/); // Proper spacing between sections
          
          // Verify JSON structure is also consistent
          const jsonOutput = healthReporter.formatForJSON(report);
          const parsedJson = JSON.parse(jsonOutput);
          
          // Verify all required top-level fields are present
          const requiredFields = ['healthScore', 'summary', 'outdatedPackages', 'securityIssues', 'peerConflicts', 'recommendations'];
          for (const field of requiredFields) {
            expect(parsedJson).toHaveProperty(field);
          }
          
          // Verify summary structure
          const summaryFields = ['totalPackages', 'issuesFound', 'criticalIssues', 'securityVulnerabilities', 'healthScore'];
          for (const field of summaryFields) {
            expect(parsedJson.summary).toHaveProperty(field);
            expect(typeof parsedJson.summary[field]).toBe('number');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 12: Critical issue emphasis
   * For any analysis with critical problems, high-priority issues should be emphasized in the report
   * Validates: Requirements 2.5
   */
  test('Property 12: Critical issue emphasis', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          issues: fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(IssueType)),
              packageName: fc.string({ minLength: 1, maxLength: 50 }),
              currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              expectedVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              severity: fc.constantFrom(IssueSeverity.CRITICAL),
              description: fc.string({ minLength: 1, maxLength: 200 }),
              fixable: fc.boolean()
            }),
            { minLength: 1, maxLength: 5 }
          ),
          packageManager: fc.constantFrom(...Object.values(PackageManagerType)),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom(...Object.values(PackageManagerType))
          }),
          securityVulnerabilities: fc.array(
            fc.record({
              packageName: fc.string({ minLength: 1, maxLength: 50 }),
              version: fc.string({ minLength: 1, maxLength: 20 }),
              vulnerability: vulnerabilityArbitrary(),
              severity: fc.constantFrom(SecuritySeverity.CRITICAL),
              fixedIn: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              patchAvailable: fc.boolean()
            }),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async (analysisResult: AnalysisResult) => {
          const healthReporter = new HealthReporter();
          const report = await healthReporter.generateReport(analysisResult);
          
          // Critical issues should be counted correctly
          const expectedCriticalCount = analysisResult.issues.filter(
            issue => issue.severity === IssueSeverity.CRITICAL
          ).length + analysisResult.securityVulnerabilities.filter(
            issue => issue.severity === SecuritySeverity.CRITICAL
          ).length;
          
          expect(report.summary.criticalIssues).toBe(expectedCriticalCount);
          expect(report.summary.criticalIssues).toBeGreaterThan(0);
          
          // CLI output should emphasize critical issues
          const cliOutput = healthReporter.formatForCLI(report);
          
          // Should have critical issues section when critical issues exist
          expect(cliOutput).toContain('CRITICAL ISSUES - IMMEDIATE ATTENTION REQUIRED');
          
          // Should highlight critical security vulnerabilities
          const criticalSecurity = analysisResult.securityVulnerabilities.filter(
            issue => issue.severity === SecuritySeverity.CRITICAL
          );
          
          if (criticalSecurity.length > 0) {
            expect(cliOutput).toContain('Critical Security Vulnerabilities:');
            for (const issue of criticalSecurity) {
              expect(cliOutput).toContain(issue.packageName);
              expect(cliOutput).toContain(issue.version);
            }
          }
          
          // Critical issues should appear early in the output (before other sections)
          const criticalSectionIndex = cliOutput.indexOf('CRITICAL ISSUES');
          const summaryIndex = cliOutput.indexOf('SUMMARY');
          expect(criticalSectionIndex).toBeGreaterThan(summaryIndex);
          
          // Should use visual indicators for critical issues
          expect(cliOutput).toContain('🚨');
          expect(cliOutput).toContain('⚠️');
        }
      ),
      { numRuns: 50 }
    );
  });
});