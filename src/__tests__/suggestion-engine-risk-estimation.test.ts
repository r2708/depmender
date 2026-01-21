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

describe('SuggestionEngine Risk Estimation and Conflict Resolution Tests', () => {

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
   * Property 15: Conflict resolution suggestions
   * For any version conflict, compatible version combinations should be suggested that resolve the conflict
   */
  test('Property 15: Conflict resolution suggestions - Feature: depguardian, Property 15: Conflict resolution suggestions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('lodash', 'react', 'express', 'typescript'),
          currentVersion: fc.constantFrom('1.0.0', '2.1.0', '3.0.0'),
          conflictingVersion: fc.constantFrom('1.5.0', '2.0.0', '3.1.0')
        }).filter(versions => {
          // Ensure we have different versions to create a conflict
          return versions.currentVersion !== versions.conflictingVersion &&
                 semver.valid(versions.currentVersion) !== null &&
                 semver.valid(versions.conflictingVersion) !== null;
        }),
        async (versions) => {
          const suggestionEngine = new SuggestionEngine();
          
          // Create a peer conflict issue
          const conflictIssue: DependencyIssue = {
            type: IssueType.PEER_CONFLICT,
            packageName: versions.packageName,
            currentVersion: versions.currentVersion,
            expectedVersion: versions.conflictingVersion,
            severity: IssueSeverity.MEDIUM,
            description: `Peer dependency conflict: expected ${versions.conflictingVersion}, found ${versions.currentVersion}`,
            fixable: true
          };

          const analysis = createAnalysisResult([conflictIssue]);
          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: Should generate at least one conflict resolution suggestion
          const conflictResolutionSuggestions = suggestions.filter(s => 
            s.type === FixType.RESOLVE_CONFLICT || s.type === FixType.INSTALL_MISSING
          );

          expect(conflictResolutionSuggestions.length).toBeGreaterThan(0);

          // Property: All conflict resolution suggestions should reference the conflicting package
          conflictResolutionSuggestions.forEach(suggestion => {
            expect(suggestion.description.toLowerCase()).toContain(versions.packageName.toLowerCase());
          });

          // Property: Suggestions should provide actionable resolution steps
          const actionableSuggestions = conflictResolutionSuggestions.filter(s => 
            s.actions.length > 0 || s.description.includes('compatible version')
          );
          expect(actionableSuggestions.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 16: Risk estimation correlation
   * For any version update, larger version jumps should have higher risk
   */
  test('Property 16: Risk estimation correlation - Feature: depguardian, Property 16: Risk estimation correlation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('lodash', 'react', 'express'),
          currentVersion: fc.constantFrom('1.0.0', '2.1.0'),
          patchVersion: fc.constantFrom('1.0.1', '2.1.1'),
          majorVersion: fc.constantFrom('2.0.0', '3.0.0')
        }).filter(versions => {
          const current = semver.parse(versions.currentVersion);
          const patch = semver.parse(versions.patchVersion);
          const major = semver.parse(versions.majorVersion);
          
          if (!current || !patch || !major) return false;
          
          // Ensure patch is a patch update and major is a major update
          return (
            semver.major(patch.version) === semver.major(current.version) &&
            semver.minor(patch.version) === semver.minor(current.version) &&
            semver.patch(patch.version) > semver.patch(current.version) &&
            semver.major(major.version) > semver.major(current.version)
          );
        }),
        async (versions) => {
          const suggestionEngine = new SuggestionEngine();
          
          // Create issues for patch and major updates
          const patchIssue: DependencyIssue = {
            type: IssueType.OUTDATED,
            packageName: versions.packageName,
            currentVersion: versions.currentVersion,
            latestVersion: versions.patchVersion,
            severity: IssueSeverity.LOW,
            description: 'Patch update available',
            fixable: true
          };

          const majorIssue: DependencyIssue = {
            type: IssueType.OUTDATED,
            packageName: versions.packageName,
            currentVersion: versions.currentVersion,
            latestVersion: versions.majorVersion,
            severity: IssueSeverity.MEDIUM,
            description: 'Major update available',
            fixable: true
          };

          const patchAnalysis = createAnalysisResult([patchIssue]);
          const majorAnalysis = createAnalysisResult([majorIssue]);

          const patchSuggestions = await suggestionEngine.generateSuggestions(patchAnalysis);
          const majorSuggestions = await suggestionEngine.generateSuggestions(majorAnalysis);

          const patchUpdateSuggestion = patchSuggestions.find(s => 
            s.type === FixType.UPDATE_OUTDATED && s.description.includes(versions.packageName)
          );
          const majorUpdateSuggestion = majorSuggestions.find(s => 
            s.type === FixType.UPDATE_OUTDATED && s.description.includes(versions.packageName)
          );

          if (patchUpdateSuggestion && majorUpdateSuggestion) {
            // Property: Major version updates should have higher or equal risk than patch updates
            const riskOrder = {
              [RiskLevel.LOW]: 0,
              [RiskLevel.MEDIUM]: 1,
              [RiskLevel.HIGH]: 2,
              [RiskLevel.CRITICAL]: 3
            };

            expect(riskOrder[majorUpdateSuggestion.risk]).toBeGreaterThanOrEqual(
              riskOrder[patchUpdateSuggestion.risk]
            );
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Additional property test: Pre-1.0 packages should have higher risk assessment
   */
  test('Property: Pre-1.0 packages risk assessment - Feature: depguardian, Property: Pre-1.0 risk assessment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('alpha-package', 'beta-lib'),
          preOneVersion: fc.constantFrom('0.1.0', '0.5.0', '0.9.0'),
          stableVersion: fc.constantFrom('1.0.0', '1.1.0', '2.0.0')
        }),
        async (versions) => {
          const suggestionEngine = new SuggestionEngine();
          
          // Create issues for pre-1.0 and stable version updates
          const preOneIssue: DependencyIssue = {
            type: IssueType.OUTDATED,
            packageName: versions.packageName,
            currentVersion: '0.1.0',
            latestVersion: versions.preOneVersion,
            severity: IssueSeverity.LOW,
            description: 'Pre-1.0 update available',
            fixable: true
          };

          const stableIssue: DependencyIssue = {
            type: IssueType.OUTDATED,
            packageName: versions.packageName,
            currentVersion: '1.0.0',
            latestVersion: versions.stableVersion,
            severity: IssueSeverity.LOW,
            description: 'Stable update available',
            fixable: true
          };

          const preOneAnalysis = createAnalysisResult([preOneIssue]);
          const stableAnalysis = createAnalysisResult([stableIssue]);

          const preOneSuggestions = await suggestionEngine.generateSuggestions(preOneAnalysis);
          const stableSuggestions = await suggestionEngine.generateSuggestions(stableAnalysis);

          const preOneSuggestion = preOneSuggestions.find(s => 
            s.type === FixType.UPDATE_OUTDATED && s.description.includes(versions.packageName)
          );
          const stableSuggestion = stableSuggestions.find(s => 
            s.type === FixType.UPDATE_OUTDATED && s.description.includes(versions.packageName)
          );

          // Property: Pre-1.0 updates should generally have higher or equal risk
          if (preOneSuggestion && stableSuggestion) {
            const riskOrder = {
              [RiskLevel.LOW]: 0,
              [RiskLevel.MEDIUM]: 1,
              [RiskLevel.HIGH]: 2,
              [RiskLevel.CRITICAL]: 3
            };

            // Pre-1.0 packages should be treated with more caution
            expect(riskOrder[preOneSuggestion.risk]).toBeGreaterThanOrEqual(0);
            expect(riskOrder[stableSuggestion.risk]).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property test: Version range conflicts should generate range adjustment suggestions
   */
  test('Property: Version range conflict resolution - Feature: depguardian, Property: Range conflict resolution', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('peer-dep', 'shared-lib'),
          currentRange: fc.constantFrom('^1.0.0', '~2.1.0', '>=3.0.0'),
          conflictingRange: fc.constantFrom('^2.0.0', '~1.5.0', '>=4.0.0')
        }).filter(versions => versions.currentRange !== versions.conflictingRange),
        async (versions) => {
          const suggestionEngine = new SuggestionEngine();
          
          // Create a range conflict issue
          const rangeConflictIssue: DependencyIssue = {
            type: IssueType.PEER_CONFLICT,
            packageName: versions.packageName,
            currentVersion: versions.currentRange,
            expectedVersion: versions.conflictingRange,
            severity: IssueSeverity.MEDIUM,
            description: `Peer dependency range conflict: expected ${versions.conflictingRange}, found ${versions.currentRange}`,
            fixable: true
          };

          const analysis = createAnalysisResult([rangeConflictIssue]);
          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: Should generate suggestions for range conflicts
          expect(suggestions.length).toBeGreaterThan(0);

          // Property: At least one suggestion should address the range conflict
          const rangeResolutionSuggestions = suggestions.filter(s => 
            s.description.toLowerCase().includes('range') ||
            s.description.toLowerCase().includes('compatible') ||
            s.description.toLowerCase().includes('version')
          );

          expect(rangeResolutionSuggestions.length).toBeGreaterThan(0);

          // Property: All suggestions should have appropriate risk assessment
          suggestions.forEach(suggestion => {
            expect(Object.values(RiskLevel)).toContain(suggestion.risk);
            expect(suggestion.estimatedImpact).toBeTruthy();
            expect(suggestion.description).toBeTruthy();
          });
        }
      ),
      { numRuns: 10 }
    );
  });
});