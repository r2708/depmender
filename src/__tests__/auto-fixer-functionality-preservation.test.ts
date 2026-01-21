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
  FixSuggestion,
  FixType,
  RiskLevel
} from '../core/types';

/**
 * Property-based tests for AutoFixer functionality preservation
 * Feature: depguardian, Property 25: Functionality preservation after fixes
 * **Validates: Requirements 4.6**
 */

// Mock package manager adapter for testing
class MockPackageManagerAdapter implements PackageManagerAdapter {
  private installedPackages: Map<string, string> = new Map();

  getType(): PackageManagerType {
    return PackageManagerType.NPM;
  }

  async readLockfile(projectPath: string): Promise<Lockfile> {
    return {
      type: PackageManagerType.NPM,
      content: { dependencies: Object.fromEntries(this.installedPackages) },
      path: path.join(projectPath, 'package-lock.json')
    };
  }

  async getInstalledPackages(projectPath: string): Promise<InstalledPackage[]> {
    return Array.from(this.installedPackages.entries()).map(([name, version]) => ({
      name,
      version,
      path: path.join(projectPath, 'node_modules', name),
      isValid: true
    }));
  }

  async installPackage(packageName: string, version?: string): Promise<void> {
    this.installedPackages.set(packageName, version || '1.0.0');
  }

  async updatePackage(packageName: string, version: string): Promise<void> {
    this.installedPackages.set(packageName, version);
  }

  async regenerateLockfile(): Promise<void> {
    // Mock implementation - lockfile reflects current installed packages
  }

  getInstalledPackageMap(): Map<string, string> {
    return new Map(this.installedPackages);
  }
}

describe('AutoFixer Functionality Preservation Tests', () => {
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
   * Property 25: Functionality preservation after fixes
   * For any applied fix, the changes should maintain project functionality
   */
  test('Property 25: Fixes maintain project functionality', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          existingPackages: fc.array(fc.record({
            name: fc.constantFrom('lodash', 'express', 'react'),
            version: fc.constantFrom('1.0.0', '2.0.0')
          }), { minLength: 1, maxLength: 3 }),
          missingPackage: fc.record({
            name: fc.constantFrom('typescript', 'jest'),
            version: fc.constantFrom('4.0.0', '5.0.0')
          })
        }),
        async ({ existingPackages, missingPackage }) => {
          // Set up initial project state
          const initialDependencies: Record<string, string> = {};
          
          // Install existing packages
          for (const pkg of existingPackages) {
            await mockAdapter.installPackage(pkg.name, pkg.version);
            initialDependencies[pkg.name] = pkg.version;
          }
          
          // Add missing package to dependencies but don't install it
          initialDependencies[missingPackage.name] = missingPackage.version;

          // Create package.json
          const packageJsonContent = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: initialDependencies
          };
          await fs.writeJson(path.join(tempDir, 'package.json'), packageJsonContent);

          // Record initial state
          const initialInstalledPackages = new Map(mockAdapter.getInstalledPackageMap());

          // Create missing dependency issue
          const missingIssue: DependencyIssue = {
            type: IssueType.MISSING,
            packageName: missingPackage.name,
            expectedVersion: missingPackage.version,
            severity: IssueSeverity.HIGH,
            description: `Missing package ${missingPackage.name}`,
            fixable: true
          };

          const analysisResult: AnalysisResult = {
            healthScore: 70,
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
          const result = await autoFixer.applyFixes(fixes);

          // Verify fix was successful
          expect(result.success).toBe(true);
          expect(result.errors.length).toBe(0);

          // Verify functionality is preserved:
          // 1. All originally installed packages should still be installed
          const finalInstalledPackages = mockAdapter.getInstalledPackageMap();
          
          for (const [packageName, version] of initialInstalledPackages) {
            expect(finalInstalledPackages.has(packageName)).toBe(true);
            expect(finalInstalledPackages.get(packageName)).toBe(version);
          }

          // 2. Missing package should now be installed
          expect(finalInstalledPackages.has(missingPackage.name)).toBe(true);
          expect(finalInstalledPackages.get(missingPackage.name)).toBe(missingPackage.version);

          // 3. Package.json should be preserved (backup should exist)
          expect(result.backup).toBeDefined();
          const currentPackageJson = await fs.readJson(path.join(tempDir, 'package.json'));
          expect(currentPackageJson.name).toBe('test-project');
          expect(currentPackageJson.dependencies).toEqual(initialDependencies);
        }
      ),
      { 
        numRuns: 1,
        timeout: 1000
      }
    );
  });

  test('Property 25: Package updates preserve compatibility', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('lodash', 'express'),
          currentVersion: fc.constantFrom('1.0.0', '2.0.0'),
          targetVersion: fc.constantFrom('1.1.0', '2.1.0')
        }),
        async ({ packageName, currentVersion, targetVersion }) => {
          // Install initial package
          await mockAdapter.installPackage(packageName, currentVersion);

          // Create package.json
          const packageJsonContent = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: { [packageName]: currentVersion }
          };
          await fs.writeJson(path.join(tempDir, 'package.json'), packageJsonContent);

          // Create update fix
          const updateFix: FixSuggestion = {
            type: FixType.UPDATE_OUTDATED,
            description: `Update ${packageName} from ${currentVersion} to ${targetVersion}`,
            risk: RiskLevel.LOW,
            actions: [{
              type: 'update',
              packageName: packageName,
              version: targetVersion
            }],
            estimatedImpact: 'Low risk update'
          };

          // Apply fix
          const result = await autoFixer.applyFixes([updateFix]);

          // Verify update was successful and functionality preserved
          expect(result.success).toBe(true);
          
          // Package should be updated to new version
          const installedPackages = mockAdapter.getInstalledPackageMap();
          expect(installedPackages.get(packageName)).toBe(targetVersion);

          // Backup should exist for rollback capability
          expect(result.backup).toBeDefined();
          
          // Original package.json structure should be preserved
          const currentPackageJson = await fs.readJson(path.join(tempDir, 'package.json'));
          expect(currentPackageJson.name).toBe('test-project');
          expect(currentPackageJson.version).toBe('1.0.0');
        }
      ),
      { 
        numRuns: 1,
        timeout: 1000
      }
    );
  });
});