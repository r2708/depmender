import * as fc from 'fast-check';
import { DependencyAnalyzer } from '../core/DependencyAnalyzer';
import {
  DependencyIssue,
  SecurityIssue,
  IssueType,
  IssueSeverity,
  SecuritySeverity,
  VulnerabilityInfo
} from '../core/types';

describe('DependencyAnalyzer Property Tests', () => {
  
  /**
   * Property 7: Health score bounds
   * For any analysis result, the calculated health score should be between 0 and 100 inclusive
   * Validates: Requirements 1.7
   */
  test('Property 7: Health score bounds - Feature: depguardian, Property 7: Health score bounds', () => {
    fc.assert(
      fc.property(
        // Generate random dependency issues
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
          { maxLength: 50 } // Test with up to 50 issues
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
          { maxLength: 20 } // Test with up to 20 security issues
        ),
        (issues: DependencyIssue[], securityIssues: SecurityIssue[]) => {
          const analyzer = new DependencyAnalyzer();
          
          // Use reflection to access the private calculateHealthScore method
          const calculateHealthScore = (analyzer as any).calculateHealthScore.bind(analyzer);
          const healthScore = calculateHealthScore(issues, securityIssues);

          // Property: Health score should always be between 0 and 100 inclusive
          expect(healthScore).toBeGreaterThanOrEqual(0);
          expect(healthScore).toBeLessThanOrEqual(100);
          
          // Additional validation: Health score should be a finite number
          expect(Number.isFinite(healthScore)).toBe(true);
          
          // Health score should be an integer (based on our scoring algorithm)
          expect(Number.isInteger(healthScore)).toBe(true);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design
    );
  });

  /**
   * Property: Health score decreases with more severe issues
   * For any set of issues, adding more severe issues should not increase the health score
   */
  test('Property: Health score severity correlation - Feature: depguardian, Property: Health score severity correlation', () => {
    fc.assert(
      fc.property(
        // Generate base set of issues
        fc.array(
          fc.record({
            type: fc.constantFrom(
              IssueType.OUTDATED,
              IssueType.MISSING,
              IssueType.BROKEN,
              IssueType.PEER_CONFLICT,
              IssueType.VERSION_MISMATCH
            ),
            packageName: fc.string({ minLength: 1, maxLength: 30 }),
            currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            expectedVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            severity: fc.constantFrom(IssueSeverity.LOW, IssueSeverity.MEDIUM),
            description: fc.string({ minLength: 1, maxLength: 100 }),
            fixable: fc.boolean()
          }),
          { maxLength: 10 }
        ),
        // Generate additional critical issue
        fc.record({
          type: fc.constantFrom(
            IssueType.OUTDATED,
            IssueType.MISSING,
            IssueType.BROKEN,
            IssueType.PEER_CONFLICT,
            IssueType.VERSION_MISMATCH
          ),
          packageName: fc.string({ minLength: 1, maxLength: 30 }),
          currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          expectedVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          severity: fc.constant(IssueSeverity.CRITICAL),
          description: fc.string({ minLength: 1, maxLength: 100 }),
          fixable: fc.boolean()
        }),
        (baseIssues: DependencyIssue[], criticalIssue: DependencyIssue) => {
          const analyzer = new DependencyAnalyzer();
          const calculateHealthScore = (analyzer as any).calculateHealthScore.bind(analyzer);
          
          // Calculate score with base issues only
          const baseScore = calculateHealthScore(baseIssues, []);
          
          // Calculate score with additional critical issue
          const scoreWithCritical = calculateHealthScore([...baseIssues, criticalIssue], []);

          // Property: Adding a critical issue should not increase the health score
          expect(scoreWithCritical).toBeLessThanOrEqual(baseScore);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Security issues have higher impact on health score
   * For any equivalent non-security and security issue, security issues should have greater impact
   */
  test('Property: Security issues higher impact - Feature: depguardian, Property: Security issues higher impact', () => {
    fc.assert(
      fc.property(
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
          severity: fc.constantFrom(SecuritySeverity.HIGH, SecuritySeverity.CRITICAL),
          fixedIn: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          patchAvailable: fc.boolean()
        }),
        fc.record({
          type: fc.constantFrom(
            IssueType.OUTDATED,
            IssueType.MISSING,
            IssueType.BROKEN,
            IssueType.PEER_CONFLICT,
            IssueType.VERSION_MISMATCH
          ),
          packageName: fc.string({ minLength: 1, maxLength: 30 }),
          currentVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          expectedVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          latestVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          severity: fc.constantFrom(IssueSeverity.HIGH, IssueSeverity.CRITICAL),
          description: fc.string({ minLength: 1, maxLength: 100 }),
          fixable: fc.boolean()
        }),
        (securityIssue: SecurityIssue, regularIssue: DependencyIssue) => {
          const analyzer = new DependencyAnalyzer();
          const calculateHealthScore = (analyzer as any).calculateHealthScore.bind(analyzer);
          
          // Calculate score with only regular issue
          const scoreWithRegular = calculateHealthScore([regularIssue], []);
          
          // Calculate score with only security issue
          const scoreWithSecurity = calculateHealthScore([], [securityIssue]);

          // Property: Security issues should have greater impact (lower score) than regular issues
          // Both start from 100, so lower score means greater impact
          expect(scoreWithSecurity).toBeLessThanOrEqual(scoreWithRegular);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty analysis should yield perfect health score
   * For any analysis with no issues, the health score should be 100
   */
  test('Property: Perfect health with no issues - Feature: depguardian, Property: Perfect health with no issues', () => {
    const analyzer = new DependencyAnalyzer();
    const calculateHealthScore = (analyzer as any).calculateHealthScore.bind(analyzer);
    
    // Calculate score with no issues
    const perfectScore = calculateHealthScore([], []);

    // Property: No issues should result in perfect health score of 100
    expect(perfectScore).toBe(100);
  });

  /**
   * Property: Health score calculation is deterministic
   * For any identical set of issues, the health score should always be the same
   */
  test('Property: Deterministic health score calculation - Feature: depguardian, Property: Deterministic health score calculation', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(
              IssueType.OUTDATED,
              IssueType.MISSING,
              IssueType.BROKEN,
              IssueType.PEER_CONFLICT,
              IssueType.VERSION_MISMATCH
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
        (issues: DependencyIssue[], securityIssues: SecurityIssue[]) => {
          const analyzer1 = new DependencyAnalyzer();
          const analyzer2 = new DependencyAnalyzer();
          
          const calculateHealthScore1 = (analyzer1 as any).calculateHealthScore.bind(analyzer1);
          const calculateHealthScore2 = (analyzer2 as any).calculateHealthScore.bind(analyzer2);
          
          // Calculate score with both analyzers
          const score1 = calculateHealthScore1(issues, securityIssues);
          const score2 = calculateHealthScore2(issues, securityIssues);

          // Property: Same inputs should always produce the same output
          expect(score1).toBe(score2);
        }
      ),
      { numRuns: 100 }
    );
  });
});