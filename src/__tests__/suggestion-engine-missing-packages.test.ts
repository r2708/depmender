import * as fc from 'fast-check';
import { SuggestionEngine } from '../fixers/SuggestionEngine';
import {
  AnalysisResult,
  DependencyIssue,
  IssueType,
  IssueSeverity,
  PackageManagerType,
  FixType,
  RiskLevel
} from '../core/types';

describe('SuggestionEngine Missing Package Tests', () => {

  // Helper function to create a valid AnalysisResult
  const createAnalysisResult = (
    issues: DependencyIssue[],
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
    securityVulnerabilities: []
  });

  /**
   * Property: Missing package suggestions should be low risk
   * For any missing package, installation suggestions should be low risk
   */
  test('Property: Missing package suggestions low risk - Feature: depguardian, Property: Missing package suggestions low risk', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            type: fc.constant(IssueType.MISSING),
            packageName: fc.constantFrom('lodash', 'react', 'express', 'axios'),
            expectedVersion: fc.option(fc.constantFrom('1.0.0', '2.1.0'), { nil: undefined }),
            severity: fc.constantFrom(IssueSeverity.MEDIUM, IssueSeverity.HIGH),
            description: fc.constant('Missing package'),
            fixable: fc.constant(true)
          }),
          { minLength: 1, maxLength: 2 }
        ),
        async (missingIssues: DependencyIssue[]) => {
          const suggestionEngine = new SuggestionEngine();
          const analysis = createAnalysisResult(missingIssues);

          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: All missing package suggestions should be low risk
          for (const issue of missingIssues) {
            const installSuggestions = suggestions.filter(s => 
              s.type === FixType.INSTALL_MISSING && 
              s.description.includes(issue.packageName)
            );
            
            expect(installSuggestions.length).toBeGreaterThan(0);
            
            for (const suggestion of installSuggestions) {
              expect(suggestion.risk).toBe(RiskLevel.LOW);
            }
          }
        }
      ),
      { numRuns: 5 }
    );
  });
});