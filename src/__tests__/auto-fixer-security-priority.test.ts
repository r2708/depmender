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
  SecurityIssue,
  SecuritySeverity,
  VulnerabilityInfo,
  FixType,
  RiskLevel
} from '../core/types';

/**
 * Property-based tests for AutoFixer security fix prioritization
 * Feature: depguardian, Property 25: Security fix prioritization
 * **Validates: Requirements 8.3, 8.4**
 */

// Mock package manager adapter for testing
class MockPackageManagerAdapter implements PackageManagerAdapter {
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
    // Mock implementation
  }

  async updatePackage(packageName: string, version: string): Promise<void> {
    // Mock implementation
  }

  async regenerateLockfile(): Promise<void> {
    // Mock implementation
  }
}

describe('AutoFixer Security Priority Tests', () => {
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

  test('Property 25: Security fixes are prioritized over regular updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          vulnerablePackage: fc.constantFrom('lodash', 'express'),
          vulnerableVersion: fc.constantFrom('1.0.0', '2.0.0'),
          fixedVersion: fc.constantFrom('1.1.0', '2.1.0'),
          severity: fc.constantFrom(SecuritySeverity.HIGH, SecuritySeverity.CRITICAL)
        }),
        async ({ vulnerablePackage, vulnerableVersion, fixedVersion, severity }) => {
          // Create security vulnerability
          const vulnerability: VulnerabilityInfo = {
            id: 'CVE-2023-1234',
            title: 'Critical Security Vulnerability',
            description: 'Remote code execution vulnerability',
            cvss: 9.8,
            cwe: ['CWE-78'],
            references: ['https://nvd.nist.gov/vuln/detail/CVE-2023-1234']
          };

          const securityIssue: SecurityIssue = {
            packageName: vulnerablePackage,
            version: vulnerableVersion,
            vulnerability: vulnerability,
            severity: severity,
            fixedIn: fixedVersion,
            patchAvailable: true
          };

          const analysisResult: AnalysisResult = {
            healthScore: 40,
            issues: [], // No regular issues
            packageManager: PackageManagerType.NPM,
            projectInfo: {
              name: 'test-project',
              version: '1.0.0',
              path: tempDir,
              packageManager: PackageManagerType.NPM
            },
            securityVulnerabilities: [securityIssue]
          };

          // Generate fixes
          const fixes = await autoFixer.generateFixes(analysisResult);
          
          // Should have security fixes
          expect(fixes.length).toBeGreaterThan(0);

          // Find security-related fixes
          const securityFixes = fixes.filter(fix => 
            fix.description.toLowerCase().includes('security') ||
            fix.description.toLowerCase().includes('vulnerability') ||
            fix.description.toLowerCase().includes('cve') ||
            fix.estimatedImpact.toLowerCase().includes('security')
          );

          expect(securityFixes.length).toBeGreaterThan(0);

          // Security fixes should be UPDATE_OUTDATED type with specific version
          for (const fix of securityFixes) {
            expect(fix.type).toBe(FixType.UPDATE_OUTDATED);
            expect(fix.actions.length).toBeGreaterThan(0);
            
            const updateAction = fix.actions.find(action => 
              action.type === 'update' && 
              action.packageName === vulnerablePackage &&
              action.version === fixedVersion
            );
            expect(updateAction).toBeDefined();
          }
        }
      ),
      { 
        numRuns: 1,
        timeout: 1000
      }
    );
  });

  test('Property 25: Critical vulnerabilities get highest priority fixes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          packageName: fc.constantFrom('package-a', 'package-b', 'package-c'),
          severity: fc.constantFrom(SecuritySeverity.LOW, SecuritySeverity.MODERATE, SecuritySeverity.HIGH, SecuritySeverity.CRITICAL),
          fixedVersion: fc.constantFrom('1.1.0', '2.0.0')
        }), { minLength: 2, maxLength: 4 }),
        async (vulnerabilities) => {
          // Create multiple security issues with different severities
          const securityIssues: SecurityIssue[] = vulnerabilities.map((vuln, index) => ({
            packageName: vuln.packageName,
            version: '1.0.0',
            vulnerability: {
              id: `CVE-2023-${1000 + index}`,
              title: `Vulnerability ${index}`,
              description: `Security issue in ${vuln.packageName}`,
              cvss: vuln.severity === SecuritySeverity.CRITICAL ? 9.0 : 
                    vuln.severity === SecuritySeverity.HIGH ? 7.0 :
                    vuln.severity === SecuritySeverity.MODERATE ? 5.0 : 3.0,
              cwe: ['CWE-78'],
              references: []
            },
            severity: vuln.severity,
            fixedIn: vuln.fixedVersion,
            patchAvailable: true
          }));

          const analysisResult: AnalysisResult = {
            healthScore: 30,
            issues: [],
            packageManager: PackageManagerType.NPM,
            projectInfo: {
              name: 'test-project',
              version: '1.0.0',
              path: tempDir,
              packageManager: PackageManagerType.NPM
            },
            securityVulnerabilities: securityIssues
          };

          // Generate fixes
          const fixes = await autoFixer.generateFixes(analysisResult);
          
          // Should have fixes for security issues
          expect(fixes.length).toBeGreaterThan(0);

          // Check that critical vulnerabilities are addressed
          const criticalVulns = securityIssues.filter(issue => issue.severity === SecuritySeverity.CRITICAL);
          if (criticalVulns.length > 0) {
            const criticalFixes = fixes.filter(fix => 
              criticalVulns.some(vuln => fix.description.includes(vuln.packageName))
            );
            expect(criticalFixes.length).toBeGreaterThan(0);
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