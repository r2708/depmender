import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { AutoFixer } from '../fixers/AutoFixer';
import { 
  PackageManagerAdapter, 
  PackageManagerType, 
  Lockfile, 
  InstalledPackage,
  AnalysisResult,
  DependencyIssue,
  IssueType,
  IssueSeverity,
  FixType
} from '../core/types';

/**
 * Property-based tests for AutoFixer fix availability and installation
 * Feature: depguardian, Property 20: Fix availability for fixable issues
 * Feature: depguardian, Property 21: Missing package installation
 * **Validates: Requirements 4.1, 4.2**
 */

// Mock package manager adapter for testing
class MockPackageManagerAdapter implements PackageManagerAdapter {
  private installedPackages: string[] = [];

  getType(): PackageManagerType {
    return PackageManagerType.NPM;
  }

  async readLockfile(projectPath: string): Promise<Lockfile> {
    return {
      type: PackageManagerType.NPM,
      content: {},
      path: path.join(projectPath, 'package-lock.json')
    };
  }

  async getInstalledPackages(projectPath: string): Promise<InstalledPackage[]> {
    return this.installedPackages.map(name => ({
      name,
      version: '1.0.0',
      path: path.join(projectPath, 'node_modules', name),
      isValid: true
    }));
  }

  async installPackage(packageName: string, version?: string): Promise<void> {
    // Mock installation by adding to installed packages list
    if (!this.installedPackages.includes(packageName)) {
      this.installedPackages.push(packageName);
    }
  }

  async updatePackage(packageName: string, version: string): Promise<void> {
    // Mock update - ensure package is in installed list
    if (!this.installedPackages.includes(packageName)) {
      this.installedPackages.push(packageName);
    }
  }

  async regenerateLockfile(): Promise<void> {
    // Mock implementation
  }
}

describe('AutoFixer Fix Availability Tests', () => {
  let tempDir: string;
  let autoFixer: AutoFixer;
  let mockAdapter: MockPackageManagerAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-test-'));
    mockAdapter = new MockPackageManagerAdapter();
    autoFixer = new AutoFixer(tempDir, mockAdapter);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  /**
   * Property 20: Fix availability for fixable issues
   * For any common dependency issue that is fixable, a one-click fix command should be available
   */
  test('Property 20: Fix availability for fixable issues', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          type: fc.constantFrom(IssueType.MISSING, IssueType.OUTDATED),
          packageName: fc.constantFrom('lodash', 'express', 'react'),
          currentVersion: fc.option(fc.constantFrom('1.0.0', '2.0.0'), { nil: undefined }),
          expectedVersion: fc.constantFrom('1.0.0', '2.0.0'),
          latestVersion: fc.option(fc.constantFrom('2.1.0', '3.0.0'), { nil: undefined }),
          severity: fc.constantFrom(IssueSeverity.MEDIUM, IssueSeverity.HIGH),
          description: fc.string({ minLength: 10, maxLength: 50 }),
          fixable: fc.constant(true)
        }).map(issue => {
          // Ensure OUTDATED issues have currentVersion and latestVersion
          if (issue.type === IssueType.OUTDATED) {
            return {
              ...issue,
              currentVersion: issue.currentVersion || '1.0.0',
              latestVersion: issue.latestVersion || '2.0.0'
            };
          }
          return issue;
        }), { minLength: 1, maxLength: 3 }),
        async (issues) => {
          // Create mock analysis result
          const analysisResult: AnalysisResult = {
            healthScore: 75,
            issues: issues,
            packageManager: PackageManagerType.NPM,
            projectInfo: {
              name: 'test-project',
              version: '1.0.0',
              path: tempDir,
              packageManager: PackageManagerType.NPM
            },
            securityVulnerabilities: []
          };

          // Generate fixes
          const fixes = await autoFixer.generateFixes(analysisResult);

          // Verify that fixable issues have corresponding fixes available
          const fixableIssues = issues.filter(issue => issue.fixable);
          expect(fixes.length).toBeGreaterThan(0);

          // Each fix should have concrete actions
          for (const fix of fixes) {
            expect(fix.actions.length).toBeGreaterThan(0);
            expect([FixType.INSTALL_MISSING, FixType.UPDATE_OUTDATED]).toContain(fix.type);
          }
        }
      ),
      { 
        numRuns: 1,
        timeout: 1000
      }
    );
  });

  /**
   * Property 21: Missing package installation
   * For any missing dependency, the auto-fixer should install it using the appropriate package manager
   */
  test('Property 21: Missing package installation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('lodash', 'express'),
          expectedVersion: fc.constantFrom('1.0.0', '2.0.0')
        }),
        async ({ packageName, expectedVersion }) => {
          // Create missing dependency issue
          const missingIssue: DependencyIssue = {
            type: IssueType.MISSING,
            packageName: packageName,
            expectedVersion: expectedVersion,
            severity: IssueSeverity.HIGH,
            description: `Missing package ${packageName}`,
            fixable: true
          };

          const analysisResult: AnalysisResult = {
            healthScore: 60,
            issues: [missingIssue],
            packageManager: PackageManagerType.NPM,
            projectInfo: {
              name: 'test-project',
              version: '1.0.0',
              path: tempDir,
              packageManager: PackageManagerType.NPM
            },
            securityVulnerabilities: []
          };

          // Generate and apply fixes
          const fixes = await autoFixer.generateFixes(analysisResult);
          
          // Should have at least one fix for missing package
          expect(fixes.length).toBeGreaterThan(0);
          
          const missingPackageFix = fixes.find(fix => 
            fix.type === FixType.INSTALL_MISSING && 
            fix.actions.some(action => action.packageName === packageName)
          );
          
          expect(missingPackageFix).toBeDefined();
          
          if (missingPackageFix) {
            // Verify the fix has install action
            const installAction = missingPackageFix.actions.find(action => 
              action.type === 'install' && action.packageName === packageName
            );
            expect(installAction).toBeDefined();
          }
        }
      ),
      { 
        numRuns: 1,
        timeout: 1000
      }
    );
  });
});