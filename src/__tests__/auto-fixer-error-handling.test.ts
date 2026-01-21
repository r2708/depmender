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
 * Property-based tests for AutoFixer error handling scenarios
 * Feature: depguardian, Property 25: Error handling and recovery
 * **Validates: Requirements 4.6**
 */

// Mock package manager adapter that can simulate failures
class FailingMockPackageManagerAdapter implements PackageManagerAdapter {
  private shouldFail = false;
  private failureType: 'install' | 'update' | 'lockfile' = 'install';

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
    return [];
  }

  async installPackage(packageName: string, version?: string): Promise<void> {
    if (this.shouldFail && this.failureType === 'install') {
      throw new Error(`Failed to install ${packageName}: Network error`);
    }
  }

  async updatePackage(packageName: string, version: string): Promise<void> {
    if (this.shouldFail && this.failureType === 'update') {
      throw new Error(`Failed to update ${packageName}: Permission denied`);
    }
  }

  async regenerateLockfile(): Promise<void> {
    if (this.shouldFail && this.failureType === 'lockfile') {
      throw new Error('Failed to regenerate lockfile: Disk full');
    }
  }

  setFailureMode(shouldFail: boolean, type: 'install' | 'update' | 'lockfile' = 'install'): void {
    this.shouldFail = shouldFail;
    this.failureType = type;
  }
}

describe('AutoFixer Error Handling Tests', () => {
  let tempDir: string;
  let autoFixer: AutoFixer;
  let mockAdapter: FailingMockPackageManagerAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-test-'));
    mockAdapter = new FailingMockPackageManagerAdapter();
    autoFixer = new AutoFixer(tempDir, mockAdapter);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('Property 25: Error handling and graceful failure recovery', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('lodash', 'express'),
          expectedVersion: fc.constantFrom('1.0.0', '2.0.0'),
          failureType: fc.constantFrom('install', 'update', 'lockfile')
        }),
        async ({ packageName, expectedVersion, failureType }) => {
          // Create package.json for backup
          await fs.writeJson(path.join(tempDir, 'package.json'), {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {}
          });

          // Create a fix suggestion that will fail
          const fixSuggestion: FixSuggestion = {
            type: FixType.INSTALL_MISSING,
            description: `Install missing package ${packageName}`,
            risk: RiskLevel.LOW,
            actions: [{
              type: failureType === 'lockfile' ? 'regenerate-lockfile' : 'install',
              packageName: failureType !== 'lockfile' ? packageName : undefined,
              version: expectedVersion
            }],
            estimatedImpact: 'Low risk installation'
          };

          // Set adapter to fail
          mockAdapter.setFailureMode(true, failureType as any);

          // Apply fixes and expect graceful error handling
          const result = await autoFixer.applyFixes([fixSuggestion]);

          // Should handle errors gracefully
          expect(result.success).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors[0]).toContain('Failed to apply fix');
          
          // Should have created a backup
          expect(result.backup).toBeDefined();
          
          // Original package.json should still exist
          const packageJsonExists = await fs.pathExists(path.join(tempDir, 'package.json'));
          expect(packageJsonExists).toBe(true);
        }
      ),
      { 
        numRuns: 1,
        timeout: 1000
      }
    );
  });

  test('Property 25: Critical error triggers backup restoration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('critical-package'),
          description: fc.constantFrom('Critical system package')
        }),
        async ({ packageName, description }) => {
          // Create package.json for backup
          const originalContent = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: { [packageName]: '1.0.0' }
          };
          await fs.writeJson(path.join(tempDir, 'package.json'), originalContent);

          // Create a critical risk fix that will fail
          const criticalFix: FixSuggestion = {
            type: FixType.UPDATE_OUTDATED,
            description: description,
            risk: RiskLevel.CRITICAL,
            actions: [{
              type: 'update',
              packageName: packageName,
              version: '2.0.0'
            }],
            estimatedImpact: 'Critical system update'
          };

          // Set adapter to fail on update
          mockAdapter.setFailureMode(true, 'update');

          // Apply fixes
          const result = await autoFixer.applyFixes([criticalFix]);

          // Should fail and restore backup for critical errors
          expect(result.success).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          
          // Verify package.json content is preserved (backup restored)
          const restoredContent = await fs.readJson(path.join(tempDir, 'package.json'));
          expect(restoredContent).toEqual(originalContent);
        }
      ),
      { 
        numRuns: 1,
        timeout: 1000
      }
    );
  });
});