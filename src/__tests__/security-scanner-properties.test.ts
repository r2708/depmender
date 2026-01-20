import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { SecurityScanner } from '../scanners/SecurityScanner';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { PackageManagerType, SecuritySeverity, SecurityIssue } from '../core/types';

describe('SecurityScanner Property Tests', () => {
  let tempDir: string;
  let scanner: SecurityScanner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-security-test-'));
    scanner = new SecurityScanner();
    
    // Suppress console warnings during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /**
   * Property 40: Vulnerability database checking
   * For any security analysis, packages should be checked against known vulnerability databases
   * Validates: Requirements 8.1
   */
  test('Property 40: Vulnerability database checking - Feature: depguardian, Property 40: Vulnerability database checking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        fc.constantFrom('lodash', 'moment', 'axios', 'express', 'react', 'vue', 'safe-package'),
        fc.constantFrom('1.0.0', '2.1.3', '0.5.2', '3.4.1'),
        async (packageManagerType, packageName, packageVersion) => {
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: `^${packageVersion}`
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
          
          // Create a valid package structure
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          
          // Create package.json
          await fs.writeJson(path.join(packagePath, 'package.json'), {
            name: packageName,
            version: packageVersion,
            main: 'index.js'
          });
          
          // Create the main entry point
          await fs.writeFile(path.join(packagePath, 'index.js'), 'module.exports = {};');

          // Add the package to context
          context.nodeModules.packages = [{
            name: packageName,
            version: packageVersion,
            path: packagePath,
            isValid: true
          }];

          const result = await scanner.scan(context);

          // Property: Scanner should return correct scanner type
          expect(result.scannerType).toBe('security');
          
          // Property: Result should have proper structure
          expect(result).toHaveProperty('scannerType');
          expect(result).toHaveProperty('issues');
          expect(result).toHaveProperty('securityIssues');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);

          // Property: All security issues should have valid structure
          result.securityIssues!.forEach(securityIssue => {
            expect(securityIssue).toHaveProperty('packageName');
            expect(securityIssue).toHaveProperty('version');
            expect(securityIssue).toHaveProperty('vulnerability');
            expect(securityIssue).toHaveProperty('severity');
            expect(securityIssue).toHaveProperty('patchAvailable');
            
            // Validate vulnerability info structure
            expect(securityIssue.vulnerability).toHaveProperty('id');
            expect(securityIssue.vulnerability).toHaveProperty('title');
            expect(securityIssue.vulnerability).toHaveProperty('description');
            expect(securityIssue.vulnerability).toHaveProperty('cvss');
            expect(securityIssue.vulnerability).toHaveProperty('cwe');
            expect(securityIssue.vulnerability).toHaveProperty('references');
            
            // Validate data types and constraints
            expect(typeof securityIssue.packageName).toBe('string');
            expect(typeof securityIssue.version).toBe('string');
            expect(typeof securityIssue.vulnerability.id).toBe('string');
            expect(typeof securityIssue.vulnerability.title).toBe('string');
            expect(typeof securityIssue.vulnerability.description).toBe('string');
            expect(typeof securityIssue.vulnerability.cvss).toBe('number');
            expect(Array.isArray(securityIssue.vulnerability.cwe)).toBe(true);
            expect(Array.isArray(securityIssue.vulnerability.references)).toBe(true);
            expect(Object.values(SecuritySeverity)).toContain(securityIssue.severity);
            expect(typeof securityIssue.patchAvailable).toBe('boolean');
            
            // CVSS score should be between 0 and 10
            expect(securityIssue.vulnerability.cvss).toBeGreaterThanOrEqual(0);
            expect(securityIssue.vulnerability.cvss).toBeLessThanOrEqual(10);
            
            // Package name should match the scanned package
            expect(securityIssue.packageName).toBe(packageName);
            expect(securityIssue.version).toBe(packageVersion);
          });

          // Property: Known vulnerable packages should generate security issues
          const knownVulnerablePackages = ['lodash', 'moment', 'axios', 'express', 'react', 'vue'];
          if (knownVulnerablePackages.includes(packageName)) {
            expect(result.securityIssues!.length).toBeGreaterThan(0);
          }

          // Property: Security issues should have appropriate severity mapping
          result.securityIssues!.forEach(securityIssue => {
            const cvss = securityIssue.vulnerability.cvss;
            const severity = securityIssue.severity;
            
            // Base CVSS mapping
            let expectedBaseSeverity: SecuritySeverity;
            if (cvss >= 9.0) {
              expectedBaseSeverity = SecuritySeverity.CRITICAL;
            } else if (cvss >= 7.0) {
              expectedBaseSeverity = SecuritySeverity.HIGH;
            } else if (cvss >= 4.0) {
              expectedBaseSeverity = SecuritySeverity.MODERATE;
            } else {
              expectedBaseSeverity = SecuritySeverity.LOW;
            }
            
            // Enhanced categorization may upgrade severity, so check it's at least the base severity
            const severityOrder = {
              [SecuritySeverity.LOW]: 1,
              [SecuritySeverity.MODERATE]: 2,
              [SecuritySeverity.HIGH]: 3,
              [SecuritySeverity.CRITICAL]: 4
            };
            
            expect(severityOrder[severity]).toBeGreaterThanOrEqual(
              severityOrder[expectedBaseSeverity]
            );
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Scanner consistency across package managers
   * For any package, security scanning should work consistently regardless of package manager
   */
  test('Property: Package manager consistency - Feature: depguardian, Property: Package manager consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        fc.constantFrom('lodash', 'express', 'react'),
        async (packageManagerType, packageName) => {
          const packageVersion = '1.0.0';
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: `^${packageVersion}`
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
          
          // Create a valid package structure
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          
          await fs.writeJson(path.join(packagePath, 'package.json'), {
            name: packageName,
            version: packageVersion,
            main: 'index.js'
          });
          
          await fs.writeFile(path.join(packagePath, 'index.js'), 'module.exports = {};');

          context.nodeModules.packages = [{
            name: packageName,
            version: packageVersion,
            path: packagePath,
            isValid: true
          }];

          const result = await scanner.scan(context);

          // Property: Scanner behavior should be consistent across package managers
          expect(result.scannerType).toBe('security');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);

          // Property: Package manager type should be preserved in context
          expect(context.packageManager.getType()).toBe(packageManagerType);

          // Property: Security issues should have consistent structure regardless of package manager
          result.securityIssues!.forEach(securityIssue => {
            expect(securityIssue).toHaveProperty('packageName');
            expect(securityIssue).toHaveProperty('version');
            expect(securityIssue).toHaveProperty('vulnerability');
            expect(securityIssue).toHaveProperty('severity');
            expect(securityIssue).toHaveProperty('patchAvailable');
          });
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Empty dependencies handling
   * For any project with no dependencies, security scanner should handle gracefully
   */
  test('Property: Empty dependencies handling - Feature: depguardian, Property: Empty dependencies handling', async () => {
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {}
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    context.nodeModules.packages = [];

    const result = await scanner.scan(context);

    // Property: Empty dependencies should not cause errors
    expect(result.scannerType).toBe('security');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.securityIssues)).toBe(true);
    expect(result.securityIssues!.length).toBe(0);
  });

  /**
   * Property: Uninstalled packages handling
   * For any package in package.json but not in node_modules, security scanner should skip it
   */
  test('Property: Uninstalled packages handling - Feature: depguardian, Property: Uninstalled packages handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.constantFrom('1.0.0', '2.1.3', '0.5.2'),
        async (packageName, packageVersion) => {
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: `^${packageVersion}`
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          
          // Don't create the package in node_modules - it's missing
          context.nodeModules.packages = [];

          const result = await scanner.scan(context);

          // Property: Missing packages should not generate security issues
          const packageSecurityIssues = result.securityIssues!.filter(issue => 
            issue.packageName === packageName
          );
          
          expect(packageSecurityIssues.length).toBe(0);
          
          // Property: Scanner should still work properly
          expect(result.scannerType).toBe('security');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property 41: Vulnerability severity categorization
   * For any found vulnerabilities, security issues should be categorized by severity level
   * Validates: Requirements 8.2
   */
  test('Property 41: Vulnerability severity categorization - Feature: depguardian, Property 41: Vulnerability severity categorization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('lodash', 'express', 'react', 'vue', 'axios'),
        fc.float({ min: 0, max: 10, noNaN: true }),
        fc.constantFrom(['CWE-78', 'CWE-79'], ['CWE-89', 'CWE-94'], ['CWE-200', 'CWE-400'], []),
        fc.boolean(),
        async (packageName, cvssScore, cweList, patchAvailable) => {
          const packageVersion = '1.0.0';
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: `^${packageVersion}`
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          
          // Create package structure
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          
          await fs.writeJson(path.join(packagePath, 'package.json'), {
            name: packageName,
            version: packageVersion,
            main: 'index.js'
          });
          
          await fs.writeFile(path.join(packagePath, 'index.js'), 'module.exports = {};');

          context.nodeModules.packages = [{
            name: packageName,
            version: packageVersion,
            path: packagePath,
            isValid: true
          }];

          // Mock the scanner to return a vulnerability with specific properties
          const originalCheckVulnerabilities = (scanner as any).checkPackageVulnerabilities;
          const originalIsPatchAvailable = (scanner as any).isPatchAvailable;
          
          (scanner as any).checkPackageVulnerabilities = jest.fn().mockResolvedValue([{
            id: 'TEST-VULN-001',
            title: 'Test Vulnerability',
            description: 'Test vulnerability description',
            cvss: cvssScore,
            cwe: cweList,
            references: ['https://example.com/vuln']
          }]);
          
          (scanner as any).isPatchAvailable = jest.fn().mockResolvedValue(patchAvailable);

          const result = await scanner.scan(context);

          // Property: Vulnerabilities should be categorized by severity level
          if (result.securityIssues!.length > 0) {
            const securityIssue = result.securityIssues![0];
            
            // Property: Severity should be valid enum value
            expect(Object.values(SecuritySeverity)).toContain(securityIssue.severity);
            
            // Property: Base CVSS mapping should be correct
            let expectedBaseSeverity: SecuritySeverity;
            if (cvssScore >= 9.0) {
              expectedBaseSeverity = SecuritySeverity.CRITICAL;
            } else if (cvssScore >= 7.0) {
              expectedBaseSeverity = SecuritySeverity.HIGH;
            } else if (cvssScore >= 4.0) {
              expectedBaseSeverity = SecuritySeverity.MODERATE;
            } else {
              expectedBaseSeverity = SecuritySeverity.LOW;
            }
            
            // Property: Severity should be at least the base CVSS severity or higher due to categorization
            const severityOrder = {
              [SecuritySeverity.LOW]: 1,
              [SecuritySeverity.MODERATE]: 2,
              [SecuritySeverity.HIGH]: 3,
              [SecuritySeverity.CRITICAL]: 4
            };
            
            expect(severityOrder[securityIssue.severity]).toBeGreaterThanOrEqual(
              severityOrder[expectedBaseSeverity]
            );
            
            // Property: Critical CWEs should upgrade severity for moderate+ CVSS scores
            const criticalCWEs = ['CWE-78', 'CWE-79', 'CWE-89', 'CWE-94', 'CWE-611'];
            const hasCriticalCWE = cweList.some(cwe => criticalCWEs.includes(cwe));
            
            if (hasCriticalCWE && cvssScore >= 6.0) {
              if (expectedBaseSeverity === SecuritySeverity.MODERATE) {
                expect(severityOrder[securityIssue.severity]).toBeGreaterThanOrEqual(
                  severityOrder[SecuritySeverity.HIGH]
                );
              } else if (expectedBaseSeverity === SecuritySeverity.HIGH) {
                expect(securityIssue.severity).toBe(SecuritySeverity.CRITICAL);
              }
            }
            
            // Property: Critical packages should get severity upgrade for moderate+ CVSS
            const criticalPackages = [
              'express', 'react', 'vue', 'angular', 'lodash', 'axios', 'request',
              'webpack', 'babel-core', 'typescript', 'eslint', 'jest'
            ];
            
            if (criticalPackages.includes(packageName) && cvssScore >= 5.0) {
              if (expectedBaseSeverity === SecuritySeverity.LOW) {
                expect(severityOrder[securityIssue.severity]).toBeGreaterThanOrEqual(
                  severityOrder[SecuritySeverity.MODERATE]
                );
              } else if (expectedBaseSeverity === SecuritySeverity.MODERATE) {
                expect(severityOrder[securityIssue.severity]).toBeGreaterThanOrEqual(
                  severityOrder[SecuritySeverity.HIGH]
                );
              }
            }
            
            // Property: Lack of patch should upgrade severity for high CVSS scores
            if (!patchAvailable && cvssScore >= 7.0 && expectedBaseSeverity === SecuritySeverity.HIGH) {
              expect(securityIssue.severity).toBe(SecuritySeverity.CRITICAL);
            }
          }

          // Restore original methods
          (scanner as any).checkPackageVulnerabilities = originalCheckVulnerabilities;
          (scanner as any).isPatchAvailable = originalIsPatchAvailable;
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Severity statistics accuracy
   * For any set of security issues, severity statistics should be accurate
   */
  test('Property: Severity statistics accuracy - Feature: depguardian, Property: Severity statistics accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            packageName: fc.constantFrom('lodash', 'express', 'react'),
            cvss: fc.float({ min: 0, max: 10, noNaN: true }),
            severity: fc.constantFrom(
              SecuritySeverity.LOW,
              SecuritySeverity.MODERATE,
              SecuritySeverity.HIGH,
              SecuritySeverity.CRITICAL
            )
          }),
          { minLength: 0, maxLength: 10 }
        ),
        async (vulnerabilityData) => {
          // Create mock security issues
          const securityIssues: SecurityIssue[] = vulnerabilityData.map((data, index) => ({
            packageName: data.packageName,
            version: '1.0.0',
            vulnerability: {
              id: `VULN-${index}`,
              title: `Vulnerability ${index}`,
              description: `Test vulnerability ${index}`,
              cvss: data.cvss,
              cwe: [],
              references: []
            },
            severity: data.severity,
            patchAvailable: true
          }));

          const stats = scanner.getSeverityStatistics(securityIssues);

          // Property: Statistics should accurately count each severity level
          const expectedStats = {
            [SecuritySeverity.CRITICAL]: 0,
            [SecuritySeverity.HIGH]: 0,
            [SecuritySeverity.MODERATE]: 0,
            [SecuritySeverity.LOW]: 0
          };

          securityIssues.forEach(issue => {
            expectedStats[issue.severity as SecuritySeverity]++;
          });

          expect(stats).toEqual(expectedStats);

          // Property: Total count should match input length
          const totalCount = Object.values(stats).reduce((sum, count) => sum + count, 0);
          expect(totalCount).toBe(securityIssues.length);

          // Property: Critical vulnerability detection should be accurate
          const hasCritical = scanner.hasCriticalVulnerabilities(securityIssues);
          const expectedHasCritical = securityIssues.some(issue => 
            issue.severity === SecuritySeverity.CRITICAL
          );
          expect(hasCritical).toBe(expectedHasCritical);

          // Property: High-risk packages should include critical and high severity packages
          const highRiskPackages = scanner.getHighRiskPackages(securityIssues);
          const expectedHighRiskPackages = new Set(
            securityIssues
              .filter(issue => 
                issue.severity === SecuritySeverity.CRITICAL || 
                issue.severity === SecuritySeverity.HIGH
              )
              .map(issue => issue.packageName)
          );

          expect(new Set(highRiskPackages)).toEqual(expectedHighRiskPackages);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Security issue prioritization
   * For any set of security issues, they should be properly prioritized by severity, CVSS, and patch availability
   */
  test('Property: Security issue prioritization - Feature: depguardian, Property: Security issue prioritization', async () => {
    const packageName = 'test-package';
    const packageVersion = '1.0.0';
    
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        [packageName]: `^${packageVersion}`
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    
    // Create package structure
    const packagePath = path.join(tempDir, 'node_modules', packageName);
    await fs.ensureDir(packagePath);
    
    await fs.writeJson(path.join(packagePath, 'package.json'), {
      name: packageName,
      version: packageVersion,
      main: 'index.js'
    });
    
    await fs.writeFile(path.join(packagePath, 'index.js'), 'module.exports = {};');

    context.nodeModules.packages = [{
      name: packageName,
      version: packageVersion,
      path: packagePath,
      isValid: true
    }];

    // Mock multiple vulnerabilities with different severities
    const originalCheckVulnerabilities = (scanner as any).checkPackageVulnerabilities;
    (scanner as any).checkPackageVulnerabilities = jest.fn().mockResolvedValue([
      {
        id: 'LOW-VULN',
        title: 'Low Severity Vulnerability',
        description: 'Low severity test',
        cvss: 2.0,
        cwe: [],
        references: []
      },
      {
        id: 'HIGH-VULN',
        title: 'High Severity Vulnerability',
        description: 'High severity test',
        cvss: 8.0,
        cwe: [],
        references: []
      },
      {
        id: 'CRITICAL-VULN',
        title: 'Critical Severity Vulnerability',
        description: 'Critical severity test',
        cvss: 9.5,
        cwe: [],
        references: []
      },
      {
        id: 'MODERATE-VULN',
        title: 'Moderate Severity Vulnerability',
        description: 'Moderate severity test',
        cvss: 5.0,
        cwe: [],
        references: []
      }
    ]);

    const result = await scanner.scan(context);

    // Property: Issues should be sorted by severity (Critical > High > Moderate > Low)
    if (result.securityIssues!.length > 1) {
      const severityOrder = {
        [SecuritySeverity.CRITICAL]: 4,
        [SecuritySeverity.HIGH]: 3,
        [SecuritySeverity.MODERATE]: 2,
        [SecuritySeverity.LOW]: 1
      };

      for (let i = 0; i < result.securityIssues!.length - 1; i++) {
        const currentSeverity = result.securityIssues![i].severity;
        const nextSeverity = result.securityIssues![i + 1].severity;
        
        expect(severityOrder[currentSeverity]).toBeGreaterThanOrEqual(
          severityOrder[nextSeverity]
        );
      }
    }

    // Restore original method
    (scanner as any).checkPackageVulnerabilities = originalCheckVulnerabilities;
  });
});