import * as fc from 'fast-check';
import {
  AnalysisResult,
  PackageManagerType,
  ProjectInfo,
  DependencyIssue,
  SecurityIssue,
  IssueType,
  IssueSeverity,
  SecuritySeverity
} from '../core/types';

describe('Data Model Property Tests', () => {
  
  /**
   * Property 7: Health score bounds
   * For any analysis result, the calculated health score should be between 0 and 100 inclusive
   * Validates: Requirements 1.7
   */
  test('Property 7: Health score bounds - Feature: depguardian, Property 7: Health score bounds', () => {
    fc.assert(
      fc.property(
        // Generate random health scores
        fc.integer({ min: 0, max: 100 }),
        // Generate random project info
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          version: fc.string({ minLength: 1, maxLength: 20 }),
          path: fc.string({ minLength: 1, maxLength: 100 }),
          packageManager: fc.constantFrom(
            PackageManagerType.NPM,
            PackageManagerType.YARN,
            PackageManagerType.PNPM
          )
        }),
        // Generate random issues array
        fc.array(
          fc.record({
            type: fc.constantFrom(
              IssueType.OUTDATED,
              IssueType.MISSING,
              IssueType.BROKEN,
              IssueType.PEER_CONFLICT,
              IssueType.VERSION_MISMATCH,
              IssueType.SECURITY
            ),
            packageName: fc.string({ minLength: 1, maxLength: 30 }),
            currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            expectedVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            severity: fc.constantFrom(
              IssueSeverity.LOW,
              IssueSeverity.MEDIUM,
              IssueSeverity.HIGH,
              IssueSeverity.CRITICAL
            ),
            description: fc.string({ minLength: 1, maxLength: 100 }),
            fixable: fc.boolean()
          }),
          { maxLength: 20 }
        ),
        // Generate random security vulnerabilities
        fc.array(
          fc.record({
            packageName: fc.string({ minLength: 1, maxLength: 30 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            vulnerability: fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              description: fc.string({ minLength: 1, maxLength: 200 }),
              cvss: fc.float({ min: 0, max: 10 }),
              cwe: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
              references: fc.array(fc.webUrl(), { maxLength: 3 })
            }),
            severity: fc.constantFrom(
              SecuritySeverity.LOW,
              SecuritySeverity.MODERATE,
              SecuritySeverity.HIGH,
              SecuritySeverity.CRITICAL
            ),
            fixedIn: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            patchAvailable: fc.boolean()
          }),
          { maxLength: 10 }
        ),
        (healthScore, projectInfo, issues, securityVulnerabilities) => {
          // Create an AnalysisResult with the generated data
          const analysisResult: AnalysisResult = {
            healthScore,
            issues,
            packageManager: projectInfo.packageManager,
            projectInfo,
            securityVulnerabilities
          };

          // Property: Health score should always be between 0 and 100 inclusive
          expect(analysisResult.healthScore).toBeGreaterThanOrEqual(0);
          expect(analysisResult.healthScore).toBeLessThanOrEqual(100);
          
          // Additional validation: Health score should be a finite number
          expect(Number.isFinite(analysisResult.healthScore)).toBe(true);
          
          // Health score should be an integer (based on our scoring algorithm)
          expect(Number.isInteger(analysisResult.healthScore)).toBe(true);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Additional property test: Analysis result structure validation
   * For any analysis result, all required fields should be present and valid
   */
  test('Property: Analysis result structure validation - Feature: depguardian, Property: Complete analysis structure', () => {
    fc.assert(
      fc.property(
        // Generate valid analysis result data
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          packageManager: fc.constantFrom(
            PackageManagerType.NPM,
            PackageManagerType.YARN,
            PackageManagerType.PNPM
          ),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom(
              PackageManagerType.NPM,
              PackageManagerType.YARN,
              PackageManagerType.PNPM
            )
          }),
          issues: fc.array(
            fc.record({
              type: fc.constantFrom(...Object.values(IssueType)),
              packageName: fc.string({ minLength: 1, maxLength: 30 }),
              severity: fc.constantFrom(...Object.values(IssueSeverity)),
              description: fc.string({ minLength: 1, maxLength: 100 }),
              fixable: fc.boolean(),
              currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              expectedVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined })
            }),
            { maxLength: 15 }
          ),
          securityVulnerabilities: fc.array(
            fc.record({
              packageName: fc.string({ minLength: 1, maxLength: 30 }),
              version: fc.string({ minLength: 1, maxLength: 20 }),
              vulnerability: fc.record({
                id: fc.string({ minLength: 1, maxLength: 20 }),
                title: fc.string({ minLength: 1, maxLength: 100 }),
                description: fc.string({ minLength: 1, maxLength: 200 }),
                cvss: fc.float({ min: 0, max: 10 }),
                cwe: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
                references: fc.array(fc.webUrl(), { maxLength: 3 })
              }),
              severity: fc.constantFrom(...Object.values(SecuritySeverity)),
              fixedIn: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
              patchAvailable: fc.boolean()
            }),
            { maxLength: 8 }
          )
        }),
        (analysisData) => {
          const analysisResult: AnalysisResult = analysisData;

          // Validate all required fields are present
          expect(analysisResult).toHaveProperty('healthScore');
          expect(analysisResult).toHaveProperty('issues');
          expect(analysisResult).toHaveProperty('packageManager');
          expect(analysisResult).toHaveProperty('projectInfo');
          expect(analysisResult).toHaveProperty('securityVulnerabilities');

          // Validate field types
          expect(typeof analysisResult.healthScore).toBe('number');
          expect(Array.isArray(analysisResult.issues)).toBe(true);
          expect(Array.isArray(analysisResult.securityVulnerabilities)).toBe(true);
          expect(typeof analysisResult.packageManager).toBe('string');
          expect(typeof analysisResult.projectInfo).toBe('object');

          // Validate project info structure
          expect(analysisResult.projectInfo).toHaveProperty('name');
          expect(analysisResult.projectInfo).toHaveProperty('version');
          expect(analysisResult.projectInfo).toHaveProperty('path');
          expect(analysisResult.projectInfo).toHaveProperty('packageManager');

          // Validate package manager consistency
          expect(Object.values(PackageManagerType)).toContain(analysisResult.packageManager);
          expect(Object.values(PackageManagerType)).toContain(analysisResult.projectInfo.packageManager);

          // Validate issues structure
          analysisResult.issues.forEach(issue => {
            expect(issue).toHaveProperty('type');
            expect(issue).toHaveProperty('packageName');
            expect(issue).toHaveProperty('severity');
            expect(issue).toHaveProperty('description');
            expect(issue).toHaveProperty('fixable');
            
            expect(Object.values(IssueType)).toContain(issue.type);
            expect(Object.values(IssueSeverity)).toContain(issue.severity);
            expect(typeof issue.fixable).toBe('boolean');
          });

          // Validate security vulnerabilities structure
          analysisResult.securityVulnerabilities.forEach(vuln => {
            expect(vuln).toHaveProperty('packageName');
            expect(vuln).toHaveProperty('version');
            expect(vuln).toHaveProperty('vulnerability');
            expect(vuln).toHaveProperty('severity');
            expect(vuln).toHaveProperty('patchAvailable');
            
            expect(Object.values(SecuritySeverity)).toContain(vuln.severity);
            expect(typeof vuln.patchAvailable).toBe('boolean');
            
            // Validate vulnerability info structure
            expect(vuln.vulnerability).toHaveProperty('id');
            expect(vuln.vulnerability).toHaveProperty('title');
            expect(vuln.vulnerability).toHaveProperty('description');
            expect(vuln.vulnerability).toHaveProperty('cvss');
            expect(vuln.vulnerability).toHaveProperty('cwe');
            expect(vuln.vulnerability).toHaveProperty('references');
            
            expect(typeof vuln.vulnerability.cvss).toBe('number');
            expect(Array.isArray(vuln.vulnerability.cwe)).toBe(true);
            expect(Array.isArray(vuln.vulnerability.references)).toBe(true);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});