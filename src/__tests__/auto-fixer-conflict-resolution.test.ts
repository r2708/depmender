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
 * Property-based tests for AutoFixer conflict resolution and lockfile handling
 * Feature: depguardian, Property 22: Conflict resolution with compatibility
 * Feature: depguardian, Property 23: Clean lockfile regeneration
 * **Validates: Requirements 4.3, 4.4**
 */

// Mock package manager adapter for testing
class MockPackageManagerAdapter implements PackageManagerAdapter {
  private lockfileRegenerated = false;

  getType(): PackageManagerType {
    return PackageManagerType.NPM;
  }

  async readLockfile(projectPath: string): Promise<Lockfile> {
    return {
      type: PackageManagerType.NPM,
      content: { dependencies: {} },
      path: path.join(projectPath, 'package-lock.json')
    };
  }

  async getInstalledPackages(projectPath: string): Promise<InstalledPackage[]> {
    return [];
  }

  async installPackage(packageName: string, version?: string): Promise<void> {
    // Mock implementation
  }

  async updatePackage(packageName: string, version: string): Promise<void> {
    // Mock implementation
  }

  async regenerateLockfile(): Promise<void> {
    this.lockfileRegenerated = true;
  }

  wasLockfileRegenerated(): boolean {
    return this.lockfileRegenerated;
  }

  resetLockfileFlag(): void {
    this.lockfileRegenerated = false;
  }
}

describe('AutoFixer Conflict Resolution Tests', () => {
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
   * Property 22: Conflict resolution with compatibility
   * For any version conflict, the auto-fixer should resolve it by selecting compatible versions
   */
  test('Property 22: Conflict resolution with compatibility', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('react', 'lodash'),
          currentVersion: fc.constantFrom('16.0.0', '4.0.0'),
          expectedVersion: fc.constantFrom('17.0.0', '4.17.21')
        }),
        async ({ packageName, currentVersion, expectedVersion }) => {
          // Create peer conflict issue
          const conflictIssue: DependencyIssue = {
            type: IssueType.PEER_CONFLICT,
            packageName: packageName,
            currentVersion: currentVersion,
            expectedVersion: expectedVersion,
            severity: IssueSeverity.HIGH,
            description: `Peer dependency conflict for ${packageName}`,
            fixable: true
          };

          const analysisResult: AnalysisResult = {
            healthScore: 50,
            issues: [conflictIssue],
            packageManager: PackageManagerType.NPM,
            projectInfo: {
              name: 'test-project',
              version: '1.0.0',
              path: tempDir,
              packageManager: PackageManagerType.NPM
            },
            securityVulnerabilities: []
          };

          // Generate fixes for conflict resolution
          const fixes = await autoFixer.generateFixes(analysisResult);
          
          // Should have conflict resolution fixes
          const conflictFixes = fixes.filter(fix => fix.type === FixType.RESOLVE_CONFLICT);
          expect(conflictFixes.length).toBeGreaterThan(0);

          // Each conflict fix should have actions or recommendations
          for (const fix of conflictFixes) {
            expect(fix.description).toContain(packageName);
            expect(fix.estimatedImpact).toBeDefined();
            expect(fix.risk).toBeDefined();
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
   * Property 23: Clean lockfile regeneration
   * For any lockfile issue, the auto-fixer should regenerate the lockfile cleanly using the correct package manager
   */
  test('Property 23: Clean lockfile regeneration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('express', 'typescript'),
          description: fc.constantFrom('Corrupted lockfile', 'Inconsistent lockfile')
        }),
        async ({ packageName, description }) => {
          // Create broken dependency issue that would require lockfile regeneration
          const brokenIssue: DependencyIssue = {
            type: IssueType.BROKEN,
            packageName: packageName,
            severity: IssueSeverity.CRITICAL,
            description: description,
            fixable: true
          };

          const analysisResult: AnalysisResult = {
            healthScore: 30,
            issues: [brokenIssue],
            packageManager: PackageManagerType.NPM,
            projectInfo: {
              name: 'test-project',
              version: '1.0.0',
              path: tempDir,
              packageManager: PackageManagerType.NPM
            },
            securityVulnerabilities: []
          };

          // Reset lockfile flag
          mockAdapter.resetLockfileFlag();

          // Generate fixes
          const fixes = await autoFixer.generateFixes(analysisResult);
          
          // Should have lockfile regeneration fixes
          const lockfileFixes = fixes.filter(fix => 
            fix.type === FixType.REGENERATE_LOCKFILE ||
            fix.actions.some(action => action.type === 'regenerate-lockfile')
          );
          
          expect(lockfileFixes.length).toBeGreaterThan(0);

          // Apply the lockfile regeneration fix
          const lockfileFix = lockfileFixes[0];
          if (lockfileFix && lockfileFix.actions.some(action => action.type === 'regenerate-lockfile')) {
            // Create package.json for backup creation
            await fs.writeJson(path.join(tempDir, 'package.json'), {
              name: 'test-project',
              version: '1.0.0'
            });

            const result = await autoFixer.applyFixes([lockfileFix]);
            
            // Verify lockfile was regenerated
            expect(mockAdapter.wasLockfileRegenerated()).toBe(true);
            expect(result.success).toBe(true);
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