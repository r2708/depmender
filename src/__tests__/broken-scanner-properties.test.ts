import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { BrokenScanner } from '../scanners/BrokenScanner';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { IssueType, IssueSeverity, PackageManagerType } from '../core/types';

describe('BrokenScanner Property Tests', () => {
  let tempDir: string;
  let scanner: BrokenScanner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-broken-test-'));
    scanner = new BrokenScanner();
    
    // Suppress console warnings during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /**
   * Property 5: Broken installation detection
   * For any project, all packages with corrupted installations or missing files should be detected as broken
   * Validates: Requirements 1.5
   */
  test('Property 5: Broken installation detection - Feature: depguardian, Property 5: Broken installation detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.constantFrom('1.0.0', '2.1.3', '0.5.2'),
        async (packageManagerType, packageName, packageVersion) => {
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: `^${packageVersion}`
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
          
          // Create a valid package structure first
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          
          // Create a valid package.json
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
          expect(result.scannerType).toBe('broken');
          
          // Property: Result should have proper structure
          expect(result).toHaveProperty('scannerType');
          expect(result).toHaveProperty('issues');
          expect(result).toHaveProperty('securityIssues');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);

          // Property: All detected issues should be BROKEN type
          result.issues.forEach(issue => {
            expect(issue.type).toBe(IssueType.BROKEN);
            expect(issue.packageName).toBe(packageName);
            expect(issue.currentVersion).toBe(packageVersion);
            expect(Object.values(IssueSeverity)).toContain(issue.severity);
            expect(typeof issue.description).toBe('string');
            expect(issue.description.length).toBeGreaterThan(0);
            expect(typeof issue.fixable).toBe('boolean');
          });

          // Property: Valid packages should not generate critical broken issues
          // (They might generate low-severity issues like missing README/LICENSE)
          const criticalIssues = result.issues.filter(issue => 
            issue.severity === IssueSeverity.CRITICAL || issue.severity === IssueSeverity.HIGH
          );
          
          // For a properly structured package, there should be no critical/high severity issues
          expect(criticalIssues.length).toBe(0);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Missing package.json detection
   * For any package without package.json, it should be detected as broken
   */
  test('Property: Missing package.json detection - Feature: depguardian, Property: Missing package.json detection', async () => {
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
          
          // Create package directory but NO package.json
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          
          // Add some other files to make it look like a package
          await fs.writeFile(path.join(packagePath, 'index.js'), 'module.exports = {};');

          context.nodeModules.packages = [{
            name: packageName,
            version: packageVersion,
            path: packagePath,
            isValid: false // Mark as invalid since package.json is missing
          }];

          const result = await scanner.scan(context);

          // Property: Missing package.json should be detected
          const missingPackageJsonIssues = result.issues.filter(issue => 
            issue.type === IssueType.BROKEN && 
            issue.packageName === packageName &&
            issue.description.includes('package.json')
          );

          expect(missingPackageJsonIssues.length).toBeGreaterThan(0);
          
          missingPackageJsonIssues.forEach(issue => {
            expect(issue.severity).toBe(IssueSeverity.HIGH);
            expect(issue.fixable).toBe(true);
          });
        }
      ),
      { numRuns: 3 }
    );
  });

  /**
   * Property: Missing entry point detection
   * For any package with package.json but missing main entry point, it should be detected
   */
  test('Property: Missing entry point detection - Feature: depguardian, Property: Missing entry point detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.constantFrom('1.0.0', '2.1.3', '0.5.2'),
        fc.constantFrom('index.js', 'main.js', 'lib/index.js'),
        async (packageName, packageVersion, mainEntry) => {
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: `^${packageVersion}`
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          
          // Create package directory with package.json but missing main entry
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          
          // Create package.json with main entry specified
          await fs.writeJson(path.join(packagePath, 'package.json'), {
            name: packageName,
            version: packageVersion,
            main: mainEntry
          });
          
          // DON'T create the main entry file

          context.nodeModules.packages = [{
            name: packageName,
            version: packageVersion,
            path: packagePath,
            isValid: false
          }];

          const result = await scanner.scan(context);

          // Property: Missing entry point should be detected
          const missingEntryIssues = result.issues.filter(issue => 
            issue.type === IssueType.BROKEN && 
            issue.packageName === packageName &&
            issue.description.includes('entry point')
          );

          expect(missingEntryIssues.length).toBeGreaterThan(0);
          
          missingEntryIssues.forEach(issue => {
            expect(issue.severity).toBe(IssueSeverity.HIGH);
            expect(issue.fixable).toBe(true);
            expect(issue.description).toContain(mainEntry);
          });
        }
      ),
      { numRuns: 3 }
    );
  });

  /**
   * Property: Package name mismatch detection
   * For any package where package.json name doesn't match expected name, it should be detected
   */
  test('Property: Package name mismatch detection - Feature: depguardian, Property: Package name mismatch detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.constantFrom('1.0.0', '2.1.3', '0.5.2'),
        async (expectedName, actualName, packageVersion) => {
          // Ensure names are different
          if (expectedName === actualName) {
            return;
          }

          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [expectedName]: `^${packageVersion}`
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          
          // Create package with mismatched name in package.json
          const packagePath = path.join(tempDir, 'node_modules', expectedName);
          await fs.ensureDir(packagePath);
          
          // Create package.json with WRONG name
          await fs.writeJson(path.join(packagePath, 'package.json'), {
            name: actualName, // Wrong name!
            version: packageVersion,
            main: 'index.js'
          });
          
          await fs.writeFile(path.join(packagePath, 'index.js'), 'module.exports = {};');

          context.nodeModules.packages = [{
            name: expectedName, // Expected name
            version: packageVersion,
            path: packagePath,
            isValid: false
          }];

          const result = await scanner.scan(context);

          // Property: Name mismatch should be detected
          const nameMismatchIssues = result.issues.filter(issue => 
            issue.type === IssueType.BROKEN && 
            issue.packageName === expectedName &&
            issue.description.includes('name') &&
            issue.description.includes('mismatch')
          );

          expect(nameMismatchIssues.length).toBeGreaterThan(0);
          
          nameMismatchIssues.forEach(issue => {
            expect(issue.severity).toBe(IssueSeverity.HIGH);
            expect(issue.fixable).toBe(true);
            expect(issue.description).toContain(actualName);
            expect(issue.description).toContain(expectedName);
          });
        }
      ),
      { numRuns: 3 }
    );
  });

  /**
   * Property: Scanner consistency across package managers
   * For any broken package, the scanner should detect issues consistently regardless of package manager
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
          
          // Create a broken package (missing package.json)
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          await fs.writeFile(path.join(packagePath, 'index.js'), 'module.exports = {};');

          context.nodeModules.packages = [{
            name: packageName,
            version: '1.0.0',
            path: packagePath,
            isValid: false
          }];

          const result = await scanner.scan(context);

          // Property: Scanner behavior should be consistent across package managers
          expect(result.scannerType).toBe('broken');
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

          // Property: Broken packages should generate at least one issue
          expect(result.issues.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 3 }
    );
  });

  /**
   * Property: Non-existent package directory detection
   * For any package that claims to exist but directory is missing, it should be detected
   */
  test('Property: Non-existent directory detection - Feature: depguardian, Property: Non-existent directory detection', async () => {
    const packageName = 'missing-package';
    const packageVersion = '1.0.0';
    
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        [packageName]: `^${packageVersion}`
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    
    // Add package to context but DON'T create the directory
    const nonExistentPath = path.join(tempDir, 'node_modules', packageName);
    
    context.nodeModules.packages = [{
      name: packageName,
      version: packageVersion,
      path: nonExistentPath,
      isValid: false
    }];

    const result = await scanner.scan(context);

    // Property: Missing directory should be detected
    const missingDirIssues = result.issues.filter(issue => 
      issue.type === IssueType.BROKEN && 
      issue.packageName === packageName &&
      issue.description.includes('directory')
    );

    expect(missingDirIssues.length).toBeGreaterThan(0);
    
    missingDirIssues.forEach(issue => {
      expect(issue.severity).toBe(IssueSeverity.HIGH);
      expect(issue.fixable).toBe(true);
    });
  });
});