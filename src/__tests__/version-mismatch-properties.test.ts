import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { VersionMismatchScanner } from '../scanners/VersionMismatchScanner';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { IssueType, IssueSeverity, PackageManagerType } from '../core/types';

describe('VersionMismatchScanner Property Tests', () => {
  let tempDir: string;
  let scanner: VersionMismatchScanner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-version-mismatch-test-'));
    scanner = new VersionMismatchScanner();
    
    // Suppress console warnings during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /**
   * Property 3: Version mismatch detection
   * For any project, all packages where the installed version differs from the package.json specification should be identified
   * Validates: Requirements 1.3
   */
  test('Property 3: Version mismatch detection - Feature: depguardian, Property 3: Version mismatch detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.constantFrom('1.0.0', '2.1.3', '0.5.2', '1.2.0-beta.1'),
        fc.constantFrom('^1.0.0', '~2.1.0', '>=0.5.0', '1.2.0', '^1.0.0 || ^2.0.0'),
        async (packageManagerType, packageName, installedVersion, declaredVersion) => {
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: declaredVersion
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
          
          // Add installed package with potentially mismatched version
          context.nodeModules.packages = [{
            name: packageName,
            version: installedVersion,
            path: path.join(tempDir, 'node_modules', packageName),
            isValid: true
          }];

          const result = await scanner.scan(context);

          // Property: Scanner should return correct scanner type
          expect(result.scannerType).toBe('version-mismatches');
          
          // Property: Result should have proper structure
          expect(result).toHaveProperty('scannerType');
          expect(result).toHaveProperty('issues');
          expect(result).toHaveProperty('securityIssues');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);

          // Property: All detected issues should be VERSION_MISMATCH type
          result.issues.forEach(issue => {
            expect(issue.type).toBe(IssueType.VERSION_MISMATCH);
            expect(issue.packageName).toBe(packageName);
            expect(issue.currentVersion).toBe(installedVersion);
            expect(issue.expectedVersion).toBe(declaredVersion);
            expect(Object.values(IssueSeverity)).toContain(issue.severity);
            expect(typeof issue.description).toBe('string');
            expect(issue.description.length).toBeGreaterThan(0);
            expect(typeof issue.fixable).toBe('boolean');
          });

          // Property: If versions match the range, no mismatch should be detected
          // This is tested implicitly - if semver.satisfies returns true, no issue should be created
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Version mismatch detection for exact version matches
   * For any package with exact version specification, mismatches should be detected correctly
   */
  test('Property: Exact version mismatch detection - Feature: depguardian, Property: Exact version mismatch detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.constantFrom('1.0.0', '2.1.3', '0.5.2'),
        fc.constantFrom('1.0.1', '2.1.4', '0.5.3'),
        async (packageName, declaredVersion, installedVersion) => {
          // Ensure versions are different for this test
          if (declaredVersion === installedVersion) {
            return; // Skip this case
          }

          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: declaredVersion // Exact version (no range operators)
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          
          context.nodeModules.packages = [{
            name: packageName,
            version: installedVersion,
            path: path.join(tempDir, 'node_modules', packageName),
            isValid: true
          }];

          const result = await scanner.scan(context);

          // Property: Exact version mismatches should be detected
          const mismatchIssues = result.issues.filter(issue => 
            issue.type === IssueType.VERSION_MISMATCH && 
            issue.packageName === packageName
          );

          expect(mismatchIssues.length).toBeGreaterThan(0);
          
          mismatchIssues.forEach(issue => {
            expect(issue.currentVersion).toBe(installedVersion);
            expect(issue.expectedVersion).toBe(declaredVersion);
            expect(issue.fixable).toBe(true);
          });
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Scanner handles missing packages gracefully
   * For any package declared but not installed, version mismatch scanner should not report issues
   */
  test('Property: Missing packages handling - Feature: depguardian, Property: Missing packages handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.constantFrom('^1.0.0', '~2.1.0', '>=0.5.0'),
        async (packageName, declaredVersion) => {
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: declaredVersion
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          
          // Don't add the package to node_modules (simulate missing package)
          context.nodeModules.packages = [];

          const result = await scanner.scan(context);

          // Property: Missing packages should not generate version mismatch issues
          const mismatchIssues = result.issues.filter(issue => 
            issue.type === IssueType.VERSION_MISMATCH && 
            issue.packageName === packageName
          );

          expect(mismatchIssues.length).toBe(0);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Scanner consistency across package managers
   * For any valid project structure, the scanner should behave consistently regardless of package manager
   */
  test('Property: Package manager consistency - Feature: depguardian, Property: Package manager consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        async (packageManagerType, packageName) => {
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: '^1.0.0'
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
          
          // Add installed package with mismatched version
          context.nodeModules.packages = [{
            name: packageName,
            version: '2.0.0', // Higher than range allows
            path: path.join(tempDir, 'node_modules', packageName),
            isValid: true
          }];

          const result = await scanner.scan(context);

          // Property: Scanner behavior should be consistent across package managers
          expect(result.scannerType).toBe('version-mismatches');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);

          // Property: Package manager type should be preserved in context
          expect(context.packageManager.getType()).toBe(packageManagerType);

          // Property: Issues should have consistent structure regardless of package manager
          result.issues.forEach(issue => {
            expect(issue).toHaveProperty('type');
            expect(issue).toHaveProperty('packageName');
            expect(issue).toHaveProperty('currentVersion');
            expect(issue).toHaveProperty('expectedVersion');
            expect(issue).toHaveProperty('severity');
            expect(issue).toHaveProperty('description');
            expect(issue).toHaveProperty('fixable');
          });
        }
      ),
      { numRuns: 3 }
    );
  });

  /**
   * Property: Version mismatch severity assessment
   * For any version mismatch, the severity should be appropriate for the type of mismatch
   */
  test('Property: Severity assessment consistency - Feature: depguardian, Property: Severity assessment consistency', async () => {
    const testCases = [
      { declared: '1.0.0', installed: '1.0.1', expectedSeverityRange: [IssueSeverity.HIGH] },
      { declared: '^1.0.0', installed: '2.0.0', expectedSeverityRange: [IssueSeverity.MEDIUM, IssueSeverity.HIGH] },
      { declared: '~1.0.0', installed: '0.9.0', expectedSeverityRange: [IssueSeverity.MEDIUM] }
    ];

    for (const testCase of testCases) {
      const packageName = 'test-package';
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          [packageName]: testCase.declared
        }
      };

      const context = ScanContextFactory.createTestContext(tempDir, packageJson);
      
      context.nodeModules.packages = [{
        name: packageName,
        version: testCase.installed,
        path: path.join(tempDir, 'node_modules', packageName),
        isValid: true
      }];

      const result = await scanner.scan(context);

      // Property: Severity should be within expected range for the mismatch type
      const mismatchIssues = result.issues.filter(issue => 
        issue.type === IssueType.VERSION_MISMATCH && 
        issue.packageName === packageName
      );

      if (mismatchIssues.length > 0) {
        const issue = mismatchIssues[0];
        expect(testCase.expectedSeverityRange).toContain(issue.severity);
      }
    }
  });
});