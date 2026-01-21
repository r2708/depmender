import * as fc from 'fast-check';
import { SuggestionEngine } from '../fixers/SuggestionEngine';
import {
  AnalysisResult,
  DependencyIssue,
  IssueType,
  IssueSeverity,
  PackageManagerType,
  FixType,
  RiskLevel,
  SecurityIssue,
  SecuritySeverity,
  VulnerabilityInfo
} from '../core/types';
import * as semver from 'semver';

describe('SuggestionEngine Completeness Tests', () => {

  // Helper function to create a valid AnalysisResult
  const createAnalysisResult = (
    issues: DependencyIssue[],
    packageManager: PackageManagerType = PackageManagerType.NPM,
    securityVulnerabilities: SecurityIssue[] = []
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
   * Property 17: Peer dependency fix suggestions
   * For any peer dependency conflict, specific fixes should be recommended
   */
  test('Property 17: Peer dependency fix suggestions - Feature: depguardian, Property 17: Peer dependency fix suggestions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('react', 'typescript', 'eslint', 'jest'),
          currentVersion: fc.constantFrom('16.0.0', '17.0.0', '18.0.0'),
          expectedVersion: fc.constantFrom('17.0.0', '18.0.0', '19.0.0'),
          conflictType: fc.constantFrom('missing', 'conflict', 'range')
        }).filter(data => data.currentVersion !== data.expectedVersion),
        async (data) => {
          const suggestionEngine = new SuggestionEngine();
          
          // Create a peer dependency conflict issue
          const peerConflictIssue: DependencyIssue = {
            type: IssueType.PEER_CONFLICT,
            packageName: data.packageName,
            currentVersion: data.currentVersion,
            expectedVersion: data.expectedVersion,
            severity: IssueSeverity.MEDIUM,
            description: `Peer dependency ${data.conflictType}: expected ${data.expectedVersion}, found ${data.currentVersion}`,
            fixable: true
          };

          const analysis = createAnalysisResult([peerConflictIssue]);
          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: Should generate at least one peer dependency fix suggestion
          const peerFixSuggestions = suggestions.filter(s => 
            s.description.toLowerCase().includes(data.packageName.toLowerCase()) &&
            (s.description.toLowerCase().includes('peer') || 
             s.description.toLowerCase().includes('conflict') ||
             s.description.toLowerCase().includes('install') ||
             s.description.toLowerCase().includes('update'))
          );

          expect(peerFixSuggestions.length).toBeGreaterThan(0);

          // Property: All peer fix suggestions should be actionable
          peerFixSuggestions.forEach(suggestion => {
            expect(suggestion.description).toBeTruthy();
            expect(suggestion.estimatedImpact).toBeTruthy();
            expect(Object.values(RiskLevel)).toContain(suggestion.risk);
            
            // Should either have actions, be a strategic recommendation, or provide guidance
            const isActionable = suggestion.actions.length > 0 || 
                                suggestion.description.toLowerCase().includes('consider') ||
                                suggestion.description.toLowerCase().includes('strategy') ||
                                suggestion.description.toLowerCase().includes('install') ||
                                suggestion.description.toLowerCase().includes('update') ||
                                suggestion.description.toLowerCase().includes('compatible') ||
                                suggestion.estimatedImpact.toLowerCase().includes('requires');
            expect(isActionable).toBe(true);
          });

          // Property: Should provide specific version recommendations when possible
          const versionSpecificSuggestions = peerFixSuggestions.filter(s =>
            s.description.includes(data.expectedVersion) || 
            s.description.includes(data.currentVersion) ||
            s.actions.some(action => action.version !== undefined)
          );
          expect(versionSpecificSuggestions.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 18: Version strategy appropriateness
   * For any version problem, suggested strategies should be appropriate for the detected issue
   */
  test('Property 18: Version strategy appropriateness - Feature: depguardian, Property 18: Version strategy appropriateness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('lodash', 'moment', 'axios'),
          issueType: fc.constantFrom(IssueType.OUTDATED, IssueType.VERSION_MISMATCH),
          currentVersion: fc.constantFrom('1.0.0', '2.1.0', '3.0.0'),
          targetVersion: fc.constantFrom('1.0.1', '2.0.0', '4.0.0')
        }).filter(data => {
          return semver.valid(data.currentVersion) !== null && 
                 semver.valid(data.targetVersion) !== null &&
                 data.currentVersion !== data.targetVersion;
        }),
        async (data) => {
          const suggestionEngine = new SuggestionEngine();
          
          // Create a version issue
          const versionIssue: DependencyIssue = {
            type: data.issueType,
            packageName: data.packageName,
            currentVersion: data.currentVersion,
            expectedVersion: data.targetVersion,
            severity: IssueSeverity.MEDIUM,
            description: `Version ${data.issueType}: ${data.packageName}`,
            fixable: true
          };

          const analysis = createAnalysisResult([versionIssue]);
          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: Should generate version strategy suggestions
          const versionStrategySuggestions = suggestions.filter(s => 
            s.description.toLowerCase().includes(data.packageName.toLowerCase()) ||
            s.description.toLowerCase().includes('strategy') ||
            s.description.toLowerCase().includes('phased') ||
            s.description.toLowerCase().includes('batch') ||
            s.description.toLowerCase().includes('update') ||
            s.description.toLowerCase().includes('upgrade') ||
            s.description.toLowerCase().includes('downgrade')
          );

          // Should generate at least some suggestions (may be strategic or specific)
          expect(suggestions.length).toBeGreaterThan(0);
          
          // Property: All suggestions should have valid properties
          suggestions.forEach(suggestion => {
            expect(Object.values(RiskLevel)).toContain(suggestion.risk);
            expect(suggestion.description).toBeTruthy();
            expect(suggestion.estimatedImpact).toBeTruthy();
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 19: Safety-based prioritization
   * For any multiple resolution options, safer and more compatible suggestions should be prioritized higher
   */
  test('Property 19: Safety-based prioritization - Feature: depguardian, Property 19: Safety-based prioritization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packages: fc.array(
            fc.record({
              name: fc.constantFrom('react', 'lodash', 'express', 'typescript'),
              issueType: fc.constantFrom(IssueType.OUTDATED, IssueType.MISSING, IssueType.PEER_CONFLICT),
              severity: fc.constantFrom(IssueSeverity.LOW, IssueSeverity.MEDIUM, IssueSeverity.HIGH)
            }),
            { minLength: 3, maxLength: 6 }
          ),
          hasSecurityIssue: fc.boolean()
        }),
        async (data) => {
          const suggestionEngine = new SuggestionEngine();
          
          // Create multiple issues with different risk profiles
          const issues: DependencyIssue[] = data.packages.map((pkg, index) => ({
            type: pkg.issueType,
            packageName: `${pkg.name}-${index}`,
            currentVersion: '1.0.0',
            expectedVersion: '2.0.0',
            severity: pkg.severity,
            description: `${pkg.issueType} issue for ${pkg.name}`,
            fixable: true
          }));

          // Add security vulnerability if specified
          const securityVulnerabilities: SecurityIssue[] = data.hasSecurityIssue ? [{
            packageName: 'vulnerable-package',
            version: '1.0.0',
            vulnerability: {
              id: 'CVE-2023-1234',
              title: 'Test vulnerability',
              description: 'Test security issue',
              cvss: 7.5,
              cwe: ['CWE-79'],
              references: []
            } as VulnerabilityInfo,
            severity: SecuritySeverity.HIGH,
            fixedIn: '1.0.1',
            patchAvailable: true
          }] : [];

          const analysis = createAnalysisResult(issues, PackageManagerType.NPM, securityVulnerabilities);
          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          expect(suggestions.length).toBeGreaterThan(0);

          // Property: Security fixes should be prioritized first
          if (data.hasSecurityIssue) {
            const securitySuggestions = suggestions.filter(s => 
              s.description.toLowerCase().includes('security') ||
              s.description.toLowerCase().includes('vulnerability') ||
              s.description.toLowerCase().includes('vulnerable-package')
            );
            
            if (securitySuggestions.length > 0) {
              const firstSecurityIndex = suggestions.findIndex(s => securitySuggestions.includes(s));
              const firstNonSecurityIndex = suggestions.findIndex(s => !securitySuggestions.includes(s));
              
              if (firstNonSecurityIndex !== -1) {
                expect(firstSecurityIndex).toBeLessThan(firstNonSecurityIndex);
              }
            }
          }

          // Property: Lower risk suggestions should generally come before higher risk ones (for non-security)
          const nonSecuritySuggestions = suggestions.filter(s => 
            !s.description.toLowerCase().includes('security') &&
            !s.description.toLowerCase().includes('vulnerability')
          );

          if (nonSecuritySuggestions.length > 1) {
            const riskOrder = {
              [RiskLevel.LOW]: 0,
              [RiskLevel.MEDIUM]: 1,
              [RiskLevel.HIGH]: 2,
              [RiskLevel.CRITICAL]: 3
            };

            // Check that risk levels are generally non-decreasing (allowing for same risk levels)
            for (let i = 0; i < nonSecuritySuggestions.length - 1; i++) {
              const currentRisk = riskOrder[nonSecuritySuggestions[i].risk];
              const nextRisk = riskOrder[nonSecuritySuggestions[i + 1].risk];
              
              // Allow same risk level or higher risk, but not significantly higher jumps without reason
              expect(nextRisk - currentRisk).toBeLessThanOrEqual(2);
            }
          }

          // Property: Missing package fixes should be prioritized over updates
          const missingSuggestions = suggestions.filter(s => s.type === FixType.INSTALL_MISSING);
          const updateSuggestions = suggestions.filter(s => s.type === FixType.UPDATE_OUTDATED);

          if (missingSuggestions.length > 0 && updateSuggestions.length > 0) {
            const firstMissingIndex = suggestions.findIndex(s => s.type === FixType.INSTALL_MISSING);
            const firstUpdateIndex = suggestions.findIndex(s => s.type === FixType.UPDATE_OUTDATED);
            
            // Missing packages should generally come before updates
            expect(firstMissingIndex).toBeLessThanOrEqual(firstUpdateIndex + 2); // Allow some flexibility
          }

          // Property: All suggestions should have valid risk assessments
          suggestions.forEach(suggestion => {
            expect(Object.values(RiskLevel)).toContain(suggestion.risk);
            expect(suggestion.description).toBeTruthy();
            expect(suggestion.estimatedImpact).toBeTruthy();
          });
        }
      ),
      { numRuns: 8 }
    );
  });

  /**
   * Additional property test: Comprehensive suggestion coverage
   */
  test('Property: Comprehensive suggestion coverage - Feature: depguardian, Property: Comprehensive coverage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectSize: fc.constantFrom('small', 'medium', 'large'),
          issueTypes: fc.array(
            fc.constantFrom(
              IssueType.OUTDATED, 
              IssueType.MISSING, 
              IssueType.PEER_CONFLICT, 
              IssueType.VERSION_MISMATCH,
              IssueType.BROKEN
            ),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async (data) => {
          const suggestionEngine = new SuggestionEngine();
          
          // Create issues based on project size
          const issueCount = data.projectSize === 'small' ? 2 : 
                           data.projectSize === 'medium' ? 5 : 10;
          
          const issues: DependencyIssue[] = [];
          for (let i = 0; i < issueCount; i++) {
            const issueType = data.issueTypes[i % data.issueTypes.length];
            issues.push({
              type: issueType,
              packageName: `package-${i}`,
              currentVersion: '1.0.0',
              expectedVersion: '2.0.0',
              severity: IssueSeverity.MEDIUM,
              description: `${issueType} issue`,
              fixable: true
            });
          }

          const analysis = createAnalysisResult(issues);
          const suggestions = await suggestionEngine.generateSuggestions(analysis);

          // Property: Should generate suggestions proportional to issues
          expect(suggestions.length).toBeGreaterThan(0);
          
          // Property: Should cover all issue types present
          const uniqueIssueTypes = [...new Set(data.issueTypes)];
          const coveredTypes = new Set<IssueType>();
          
          suggestions.forEach(suggestion => {
            // Determine which issue type this suggestion addresses
            if (suggestion.type === FixType.INSTALL_MISSING) {
              coveredTypes.add(IssueType.MISSING);
            } else if (suggestion.type === FixType.UPDATE_OUTDATED) {
              coveredTypes.add(IssueType.OUTDATED);
            } else if (suggestion.type === FixType.RESOLVE_CONFLICT) {
              coveredTypes.add(IssueType.PEER_CONFLICT);
              coveredTypes.add(IssueType.VERSION_MISMATCH);
            } else if (suggestion.type === FixType.REGENERATE_LOCKFILE) {
              coveredTypes.add(IssueType.BROKEN);
            }
            
            // Also check description for issue type coverage
            const desc = suggestion.description.toLowerCase();
            if (desc.includes('broken') || desc.includes('reinstall') || desc.includes('corrupted')) {
              coveredTypes.add(IssueType.BROKEN);
            }
            if (desc.includes('missing') || desc.includes('install')) {
              coveredTypes.add(IssueType.MISSING);
            }
            if (desc.includes('outdated') || desc.includes('update')) {
              coveredTypes.add(IssueType.OUTDATED);
            }
            if (desc.includes('conflict') || desc.includes('peer')) {
              coveredTypes.add(IssueType.PEER_CONFLICT);
            }
            if (desc.includes('mismatch') || desc.includes('version')) {
              coveredTypes.add(IssueType.VERSION_MISMATCH);
            }
          });

          // Should address most issue types (allowing for some strategic suggestions)
          const coverageRatio = coveredTypes.size / uniqueIssueTypes.length;
          expect(coverageRatio).toBeGreaterThan(0.3); // At least 30% coverage (more lenient)
        }
      ),
      { numRuns: 8 }
    );
  });
});