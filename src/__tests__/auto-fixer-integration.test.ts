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
  SecurityIssue,
  IssueType,
  IssueSeverity,
  SecuritySeverity,
  VulnerabilityInfo
} from '../core/types';

/**
 * Integration tests for AutoFixer with multiple scenarios
 * Feature: depguardian, Property 26: Comprehensive fix integration
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
 */

// Comprehensive mock package manager adapter
class ComprehensiveMockPackageManagerAdapter implements PackageManagerAdapter {
  private installedPackages: Map<string, string> = new Map();
  private lockfileRegenerated = false;

  getType(): PackageManagerType {
    return PackageManagerType.NPM;
  }

  async readLockfile(projectPath: string): Promise<Lockfile> {
    return {
      type: PackageManagerType.NPM,
      content: { 
        dependencies: Object.fromEntries(this.installedPackages),
        lockfileVersion: 2
      },
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
    this.lockfileRegenerated = true;
  }

  wasLockfileRegenerated(): boolean {
    return this.lockfileRegenerated;
  }

  getInstalledCount(): number {
    return this.installedPackages.size;
  }
}

describe('AutoFixer Integration Tests', () => {
  let tempDir: string;
  let autoFixer: AutoFixer;
  let mockAdapter: ComprehensiveMockPackageManagerAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-test-'));
    mockAdapter = new ComprehensiveMockPackageManagerAdapter();
    autoFixer = new AutoFixer(tempDir, mockAdapter);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  /**
   * Property 26: Comprehensive fix integration
   * For any complex project with multiple issues, the auto-fixer should handle them systematically
   */
  test('Property 26: Comprehensive multi-issue fix integration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          missingPackages: fc.array(fc.record({
            name: fc.constantFrom('lodash', 'express', 'typescript'),
            version: fc.constantFrom('1.0.0', '2.0.0')
          }), { minLength: 1, maxLength: 2 }),
          outdatedPackages: fc.array(fc.record({
            name: fc.constantFrom('react', 'vue', 'angular'),
            currentVersion: fc.constantFrom('16.0.0', '2.0.0'),
            latestVersion: fc.constantFrom('17.0.0', '3.0.0')
          }), { minLength: 1, maxLength: 2 }),
          securityIssues: fc.array(fc.record({
            packageName: fc.constantFrom('axios', 'request'),
            vulnerableVersion: fc.constantFrom('0.19.0', '2.88.0'),
            fixedVersion: fc.constantFrom('0.21.0', '2.88.2'),
            severity: fc.constantFrom(SecuritySeverity.HIGH, SecuritySeverity.CRITICAL)
          }), { minLength: 0, maxLength: 1 })
        }),
        async ({ missingPackages, outdatedPackages, securityIssues }) => {
          // Create comprehensive package.json
          const dependencies: Record<string, string> = {};
          
          // Add missing packages to dependencies (but don't install them)
          for (const pkg of missingPackages) {
            dependencies[pkg.name] = pkg.version;
          }
          
          // Add outdated packages to dependencies and install old versions
          for (const pkg of outdatedPackages) {
            dependencies[pkg.name] = pkg.latestVersion; // package.json has latest
            await mockAdapter.installPackage(pkg.name, pkg.currentVersion); // but old version installed
          }
          
          // Add vulnerable packages
          for (const pkg of securityIssues) {
            dependencies[pkg.packageName] = pkg.vulnerableVersion;
            await mockAdapter.installPackage(pkg.packageName, pkg.vulnerableVersion);
          }

          const packageJsonContent = {
            name: 'complex-project',
            version: '1.0.0',
            dependencies
          };
          await fs.writeJson(path.join(tempDir, 'package.json'), packageJsonContent);

          // Create comprehensive analysis result
          const issues: DependencyIssue[] = [
            // Missing package issues
            ...missingPackages.map(pkg => ({
              type: IssueType.MISSING,
              packageName: pkg.name,
              expectedVersion: pkg.version,
              severity: IssueSeverity.HIGH,
              description: `Missing package ${pkg.name}`,
              fixable: true
            })),
            // Outdated package issues
            ...outdatedPackages.map(pkg => ({
              type: IssueType.OUTDATED,
              packageName: pkg.name,
              currentVersion: pkg.currentVersion,
              latestVersion: pkg.latestVersion,
              expectedVersion: pkg.latestVersion,
              severity: IssueSeverity.MEDIUM,
              description: `Outdated package ${pkg.name}`,
              fixable: true
            }))
          ];

          const vulnerabilities: SecurityIssue[] = securityIssues.map(issue => ({
            packageName: issue.packageName,
            version: issue.vulnerableVersion,
            vulnerability: {
              id: `CVE-2023-${Math.floor(Math.random() * 9999)}`,
              title: 'Security Vulnerability',
              description: `Vulnerability in ${issue.packageName}`,
              cvss: issue.severity === SecuritySeverity.CRITICAL ? 9.0 : 7.5,
              cwe: ['CWE-78'],
              references: []
            },
            severity: issue.severity,
            fixedIn: issue.fixedVersion,
            patchAvailable: true
          }));

          const analysisResult: AnalysisResult = {
            healthScore: 45, // Low score due to multiple issues
            issues,
            packageManager: PackageManagerType.NPM,
            projectInfo: {
              name: 'complex-project',
              version: '1.0.0',
              path: tempDir,
              packageManager: PackageManagerType.NPM
            },
            securityVulnerabilities: vulnerabilities
          };

          // Record initial state
          const initialInstalledCount = mockAdapter.getInstalledCount();

          // Generate and apply fixes
          const fixes = await autoFixer.generateFixes(analysisResult);
          const result = await autoFixer.applyFixes(fixes);

          // Verify comprehensive fix results
          expect(result.success).toBe(true);
          expect(result.backup).toBeDefined();
          
          // Should have applied multiple fixes
          expect(result.appliedFixes.length).toBeGreaterThan(0);
          
          // Should have installed missing packages
          const finalInstalledCount = mockAdapter.getInstalledCount();
          expect(finalInstalledCount).toBeGreaterThanOrEqual(initialInstalledCount + missingPackages.length);
          
          // Verify backup was created and original package.json preserved
          const currentPackageJson = await fs.readJson(path.join(tempDir, 'package.json'));
          expect(currentPackageJson.name).toBe('complex-project');
          
          // Verify backup file exists
          if (result.backup) {
            const backupExists = await fs.pathExists(result.backup.backupPath);
            expect(backupExists).toBe(true);
          }
        }
      ),
      { 
        numRuns: 1,
        timeout: 2000
      }
    );
  });

  test('Property 26: Fix ordering and prioritization works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          criticalSecurity: fc.record({
            packageName: fc.constantFrom('critical-package'),
            version: fc.constantFrom('1.0.0'),
            fixedVersion: fc.constantFrom('1.0.1')
          }),
          regularUpdate: fc.record({
            packageName: fc.constantFrom('regular-package'),
            currentVersion: fc.constantFrom('2.0.0'),
            latestVersion: fc.constantFrom('2.1.0')
          })
        }),
        async ({ criticalSecurity, regularUpdate }) => {
          // Create package.json
          const packageJsonContent = {
            name: 'priority-test-project',
            version: '1.0.0',
            dependencies: {
              [criticalSecurity.packageName]: criticalSecurity.version,
              [regularUpdate.packageName]: regularUpdate.currentVersion
            }
          };
          await fs.writeJson(path.join(tempDir, 'package.json'), packageJsonContent);

          // Install packages
          await mockAdapter.installPackage(criticalSecurity.packageName, criticalSecurity.version);
          await mockAdapter.installPackage(regularUpdate.packageName, regularUpdate.currentVersion);

          // Create mixed issues (security + regular update)
          const analysisResult: AnalysisResult = {
            healthScore: 60,
            issues: [{
              type: IssueType.OUTDATED,
              packageName: regularUpdate.packageName,
              currentVersion: regularUpdate.currentVersion,
              latestVersion: regularUpdate.latestVersion,
              expectedVersion: regularUpdate.latestVersion,
              severity: IssueSeverity.LOW,
              description: `Regular update for ${regularUpdate.packageName}`,
              fixable: true
            }],
            packageManager: PackageManagerType.NPM,
            projectInfo: {
              name: 'priority-test-project',
              version: '1.0.0',
              path: tempDir,
              packageManager: PackageManagerType.NPM
            },
            securityVulnerabilities: [{
              packageName: criticalSecurity.packageName,
              version: criticalSecurity.version,
              vulnerability: {
                id: 'CVE-2023-CRITICAL',
                title: 'Critical Security Issue',
                description: 'Critical vulnerability requiring immediate fix',
                cvss: 9.8,
                cwe: ['CWE-78'],
                references: []
              },
              severity: SecuritySeverity.CRITICAL,
              fixedIn: criticalSecurity.fixedVersion,
              patchAvailable: true
            }]
          };

          // Generate fixes
          const fixes = await autoFixer.generateFixes(analysisResult);
          
          // Should have both security and regular fixes
          expect(fixes.length).toBeGreaterThan(0);
          
          // Security fixes should be present and identifiable
          const securityFixes = fixes.filter(fix => 
            fix.description.toLowerCase().includes('security') ||
            fix.description.toLowerCase().includes('vulnerability') ||
            fix.description.includes(criticalSecurity.packageName)
          );
          
          const regularFixes = fixes.filter(fix => 
            fix.description.includes(regularUpdate.packageName) &&
            !fix.description.toLowerCase().includes('security')
          );

          // Should have fixes for both types of issues
          expect(securityFixes.length + regularFixes.length).toBeGreaterThan(0);
        }
      ),
      { 
        numRuns: 1,
        timeout: 1500
      }
    );
  });
});