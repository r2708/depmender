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
import * as semver from 'semver';

describe('SuggestionEngine Update Path Tests', () => {

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
   * Property 14: Update path recommendations
   * For any outdated package, safe update paths should be recommended by the suggestion engine
   * Validates: Requirements 3.1
   */
  test('Property 14: Update path recommendations - Feature: depguardian, Property 14: Update path recommendations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate outdated package issues with predefined valid semver versions
        fc.array(
          fc.record({
            type: fc.constant(IssueType.OUTDATED),
            packageName: fc.constantFrom('lodash', 'react', 'express', 'axios', 'moment'),
            currentVersion: fc.constantFrom('1.0.0', '2.1.0', '3.2.1'),
            latestVersion: fc.constantFrom('1.1.0', '2.2.0', '4.0.0'),
            expectedVersion: fc.option(fc.constantFrom('1.0.5', '2.1.5'), { nil: undefined }),
            severity: fc.constantFrom(
              IssueSeverity.LOW,
              IssueSeverity.MEDIUM,
              IssueSeverity.HIGH
            ),
            description: fc.constant('Package update available'),
            fixable: fc.constant(true)
          }).filter(issue => {
            // Ensure latest version is actually newer than current
            return semver.gt(issue.latestVersion, issue.currentVersion);
          }),
          { minLength: 1, maxLength: 3 }
        ),
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        async (outdatedIssues: DependencyIssue[], packageManager: PackageManagerType) => {
          const suggestionEngine = new SuggestionEngine();
          const analysis = createAnalysisResult(outdatedIssues, packageManager);

          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: For each outdated package, there should be at least one update suggestion
          for (const issue of outdatedIssues) {
            const updateSuggestions = suggestions.filter(s => 
              s.type === FixType.UPDATE_OUTDATED && 
              s.description.includes(issue.packageName)
            );
            
            expect(updateSuggestions.length).toBeGreaterThan(0);
            
            // Each suggestion should have valid actions
            for (const suggestion of updateSuggestions) {
              expect(suggestion.actions.length).toBeGreaterThan(0);
              expect(suggestion.risk).toBeDefined();
              expect(Object.values(RiskLevel)).toContain(suggestion.risk);
              expect(suggestion.estimatedImpact).toBeDefined();
              expect(suggestion.estimatedImpact.length).toBeGreaterThan(0);
              
              // Actions should have appropriate commands for the package manager
              for (const action of suggestion.actions) {
                if (action.command) {
                  switch (packageManager) {
                    case PackageManagerType.NPM:
                      expect(action.command).toContain('npm');
                      break;
                    case PackageManagerType.YARN:
                      expect(action.command).toContain('yarn');
                      break;
                    case PackageManagerType.PNPM:
                      expect(action.command).toContain('pnpm');
                      break;
                  }
                }
              }
            }
          }
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Safe update paths should respect semantic versioning
   * For any outdated package, suggested update paths should follow semver principles
   */
  test('Property: Safe update paths respect semver - Feature: depguardian, Property: Safe update paths respect semver', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constant(IssueType.OUTDATED),
          packageName: fc.constantFrom('lodash', 'react', 'express'),
          currentVersion: fc.constantFrom('1.0.0', '2.1.0'),
          latestVersion: fc.constantFrom('1.1.0', '2.2.0', '3.0.0'),
          expectedVersion: fc.option(fc.constantFrom('1.0.5', '2.1.5'), { nil: undefined }),
          severity: fc.constantFrom(IssueSeverity.LOW, IssueSeverity.MEDIUM, IssueSeverity.HIGH),
          description: fc.constant('Package update available'),
          fixable: fc.constant(true)
        }).filter(issue => {
          // Ensure latest version is actually newer than current
          return semver.gt(issue.latestVersion, issue.currentVersion);
        }),
        async (outdatedIssue: DependencyIssue) => {
          const suggestionEngine = new SuggestionEngine();
          const analysis = createAnalysisResult([outdatedIssue]);

          const suggestions = await suggestionEngine.generateSuggestions(analysis);
          const updateSuggestions = suggestions.filter(s => 
            s.type === FixType.UPDATE_OUTDATED && 
            s.description.includes(outdatedIssue.packageName)
          );

          // Property: All suggested versions should be valid and between current and latest
          for (const suggestion of updateSuggestions) {
            for (const action of suggestion.actions) {
              if (action.version && action.packageName === outdatedIssue.packageName) {
                expect(semver.valid(action.version)).toBeTruthy();
                expect(semver.gte(action.version, outdatedIssue.currentVersion!)).toBe(true);
                expect(semver.lte(action.version, outdatedIssue.latestVersion!)).toBe(true);
              }
            }
          }
        }
      ),
      { numRuns: 5 }
    );
  });
});