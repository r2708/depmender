import * as fc from 'fast-check';
import { SuggestionEngine } from '../fixers/SuggestionEngine';
import {
  AnalysisResult,
  DependencyIssue,
  SecurityIssue,
  IssueType,
  IssueSeverity,
  SecuritySeverity,
  PackageManagerType
} from '../core/types';

describe('SuggestionEngine Security Priority Tests', () => {

  // Helper function to create a valid AnalysisResult
  const createAnalysisResult = (
    issues: DependencyIssue[],
    securityVulnerabilities: SecurityIssue[] = [],
    packageManager: PackageManagerType = PackageManagerType.NPM
  ): AnalysisResult => ({
    healthScore: 85,
    issues,
    packageManager,
    projectInfo: {
      name: 'test-project',
      version: '1.0.0',
      path: '/test/path',
      packageManager
    },
    securityVulnerabilities
  });

  /**
   * Property: Security suggestions should be prioritized
   * For any analysis with both security and non-security issues, security fixes should come first
   */
  test('Property: Security suggestions prioritized - Feature: depguardian, Property: Security suggestions prioritized', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('lodash', 'react', 'express'),
          version: fc.constantFrom('1.0.0', '2.1.0'),
          fixedIn: fc.constantFrom('1.1.0', '2.2.0'),
          vulnerability: fc.record({
            id: fc.constantFrom('CVE-2021-1234', 'CVE-2022-5678'),
            title: fc.constant('Security vulnerability'),
            description: fc.constant('A security issue was found'),
            cvss: fc.constantFrom(7.5, 8.2, 9.1),
            cwe: fc.constant(['CWE-79']),
            references: fc.constant(['https://example.com/vuln'])
          }),
          severity: fc.constantFrom(SecuritySeverity.HIGH, SecuritySeverity.CRITICAL),
          patchAvailable: fc.constant(true)
        }),
        fc.record({
          type: fc.constantFrom(IssueType.OUTDATED, IssueType.MISSING),
          packageName: fc.constantFrom('axios', 'moment', 'uuid'),
          currentVersion: fc.option(fc.constantFrom('1.0.0', '2.1.0'), { nil: undefined }),
          expectedVersion: fc.option(fc.constantFrom('1.1.0', '2.2.0'), { nil: undefined }),
          latestVersion: fc.option(fc.constantFrom('1.2.0', '2.3.0'), { nil: undefined }),
          severity: fc.constantFrom(IssueSeverity.LOW, IssueSeverity.MEDIUM),
          description: fc.constant('Regular issue'),
          fixable: fc.constant(true)
        }),
        async (securityIssue: SecurityIssue, regularIssue: DependencyIssue) => {
          // Ensure different package names to avoid conflicts
          if (securityIssue.packageName === regularIssue.packageName) {
            regularIssue.packageName = regularIssue.packageName + '-different';
          }

          const suggestionEngine = new SuggestionEngine();
          const analysis = createAnalysisResult([regularIssue], [securityIssue]);

          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          if (suggestions.length >= 2) {
            // Find security and non-security suggestions
            const securitySuggestionIndex = suggestions.findIndex(s => 
              s.description.includes('security') || s.description.includes('vulnerability')
            );
            const regularSuggestionIndex = suggestions.findIndex(s => 
              !s.description.includes('security') && !s.description.includes('vulnerability')
            );

            // Property: If both exist, security suggestions should come before regular ones
            if (securitySuggestionIndex !== -1 && regularSuggestionIndex !== -1) {
              expect(securitySuggestionIndex).toBeLessThan(regularSuggestionIndex);
            }
          }
        }
      ),
      { numRuns: 5 }
    );
  });
});