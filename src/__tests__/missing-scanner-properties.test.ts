import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { MissingScanner } from '../scanners/MissingScanner';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { IssueType, IssueSeverity, PackageManagerType } from '../core/types';

describe('MissingScanner Property Tests', () => {
  let tempDir: string;
  let scanner: MissingScanner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-missing-test-'));
    scanner = new MissingScanner();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  /**
   * Property 4: Missing dependency detection
   * For any project, all packages listed in package.json but not present in node_modules should be identified as missing
   * Validates: Requirements 1.4
   */
  test('Property 4: Missing dependency detection - Feature: depguardian, Property 4: Missing dependency detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate package names and versions
        fc.array(
          fc.record({
            name: fc.stringOf(fc.char().filter(c => /[a-z0-9-]/.test(c)), { minLength: 3, maxLength: 20 }),
            version: fc.constantFrom('^1.0.0', '~2.1.0', '>=3.0.0', '1.2.3', '*')
          }),
          { minLength: 1, maxLength: 5 }
        ),
        // Generate which packages should be "installed" (subset of declared packages)
        fc.float({ min: 0, max: 1 }), // Ratio of packages to install
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        async (declaredPackages, installRatio, packageManagerType) => {
          // Create package.json with declared dependencies
          const dependencies: Record<string, string> = {};
          const devDependencies: Record<string, string> = {};
          const peerDependencies: Record<string, string> = {};
          const optionalDependencies: Record<string, string> = {};

          // Distribute packages across different dependency types
          declaredPackages.forEach((pkg, index) => {
            const depType = index % 4;
            switch (depType) {
              case 0:
                dependencies[pkg.name] = pkg.version;
                break;
              case 1:
                devDependencies[pkg.name] = pkg.version;
                break;
              case 2:
                peerDependencies[pkg.name] = pkg.version;
                break;
              case 3:
                optionalDependencies[pkg.name] = pkg.version;
                break;
            }
          });

          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: Object.keys(dependencies).length > 0 ? dependencies : undefined,
            devDependencies: Object.keys(devDependencies).length > 0 ? devDependencies : undefined,
            peerDependencies: Object.keys(peerDependencies).length > 0 ? peerDependencies : undefined,
            optionalDependencies: Object.keys(optionalDependencies).length > 0 ? optionalDependencies : undefined
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);

          // Simulate some packages being installed (based on install ratio)
          const numToInstall = Math.floor(declaredPackages.length * installRatio);
          const installedPackages = declaredPackages.slice(0, numToInstall);
          
          context.nodeModules.packages = installedPackages.map(pkg => ({
            name: pkg.name,
            version: pkg.version.replace(/[\^~>=*]/g, ''), // Clean version for installed package
            path: path.join(tempDir, 'node_modules', pkg.name),
            isValid: true
          }));

          const result = await scanner.scan(context);

          // Property: Scanner should return correct scanner type
          expect(result.scannerType).toBe('missing');
          
          // Property: Result should have issues array
          expect(Array.isArray(result.issues)).toBe(true);
          
          // Property: All issues should be of MISSING type
          result.issues.forEach(issue => {
            expect(issue.type).toBe(IssueType.MISSING);
            expect(issue.fixable).toBe(true);
            expect(typeof issue.packageName).toBe('string');
            expect(issue.packageName.length).toBeGreaterThan(0);
            expect(Object.values(IssueSeverity)).toContain(issue.severity);
            expect(issue.currentVersion).toBeUndefined(); // Missing packages have no current version
            expect(typeof issue.expectedVersion).toBe('string');
            expect(typeof issue.description).toBe('string');
            expect(issue.description.length).toBeGreaterThan(0);
          });

          // Property: Number of missing issues should equal declared packages minus installed packages
          const expectedMissingCount = declaredPackages.length - installedPackages.length;
          expect(result.issues.length).toBe(expectedMissingCount);

          // Property: Each missing package should be in the declared dependencies but not in installed packages
          const installedPackageNames = new Set(installedPackages.map(pkg => pkg.name));
          const declaredPackageNames = new Set(declaredPackages.map(pkg => pkg.name));
          
          result.issues.forEach(issue => {
            expect(declaredPackageNames.has(issue.packageName)).toBe(true);
            expect(installedPackageNames.has(issue.packageName)).toBe(false);
          });

          // Property: Missing packages should have appropriate severity based on dependency type
          result.issues.forEach(issue => {
            if (dependencies[issue.packageName]) {
              // Regular dependencies should be CRITICAL
              expect(issue.severity).toBe(IssueSeverity.CRITICAL);
            } else if (devDependencies[issue.packageName]) {
              // Dev dependencies should be HIGH
              expect(issue.severity).toBe(IssueSeverity.HIGH);
            } else if (peerDependencies[issue.packageName]) {
              // Peer dependencies should be HIGH
              expect(issue.severity).toBe(IssueSeverity.HIGH);
            } else if (optionalDependencies[issue.packageName]) {
              // Optional dependencies should be LOW
              expect(issue.severity).toBe(IssueSeverity.LOW);
            }
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Scanner behavior with empty dependencies
   * For any project with no declared dependencies, no missing issues should be detected
   */
  test('Property: No missing issues for empty dependencies - Feature: depguardian, Property: Empty dependencies handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        async (packageManagerType) => {
          const packageJson = {
            name: 'empty-project',
            version: '1.0.0'
            // No dependencies declared
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
          const result = await scanner.scan(context);

          // Property: No missing issues should be found when no dependencies are declared
          expect(result.issues).toHaveLength(0);
          expect(result.scannerType).toBe('missing');
        }
      ),
      { numRuns: 3 }
    );
  });

  /**
   * Property: Scanner behavior with all packages installed
   * For any project where all declared packages are installed, no missing issues should be detected
   */
  test('Property: No missing issues when all packages installed - Feature: depguardian, Property: Complete installation handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.stringOf(fc.char().filter(c => /[a-z0-9-]/.test(c)), { minLength: 3, maxLength: 15 }),
            version: fc.constantFrom('^1.0.0', '~2.1.0', '1.2.3')
          }),
          { minLength: 1, maxLength: 3 }
        ),
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        async (packages, packageManagerType) => {
          const dependencies: Record<string, string> = {};
          packages.forEach(pkg => {
            dependencies[pkg.name] = pkg.version;
          });

          const packageJson = {
            name: 'complete-project',
            version: '1.0.0',
            dependencies
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
          
          // Install all declared packages
          context.nodeModules.packages = packages.map(pkg => ({
            name: pkg.name,
            version: pkg.version.replace(/[\^~>=*]/g, ''),
            path: path.join(tempDir, 'node_modules', pkg.name),
            isValid: true
          }));

          const result = await scanner.scan(context);

          // Property: No missing issues should be found when all packages are installed
          expect(result.issues).toHaveLength(0);
          expect(result.scannerType).toBe('missing');
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Scanner consistency across package managers
   * For any identical project setup, the scanner should behave consistently across different package managers
   */
  test('Property: Consistent behavior across package managers - Feature: depguardian, Property: Package manager consistency', async () => {
    const packageJson = {
      name: 'test-consistency',
      version: '1.0.0',
      dependencies: {
        'missing-package': '^1.0.0'
      },
      devDependencies: {
        'missing-dev-package': '^2.0.0'
      }
    };

    const results: any[] = [];

    // Test with all package managers
    for (const packageManagerType of [PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM]) {
      const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
      // Don't install any packages - all should be missing
      const result = await scanner.scan(context);
      results.push(result);
    }

    // Property: All package managers should produce identical results for the same project
    expect(results).toHaveLength(3);
    
    results.forEach(result => {
      expect(result.scannerType).toBe('missing');
      expect(result.issues).toHaveLength(2); // 2 missing packages
      
      const packageNames = result.issues.map((issue: any) => issue.packageName).sort();
      expect(packageNames).toEqual(['missing-dev-package', 'missing-package']);
      
      result.issues.forEach((issue: any) => {
        expect(issue.type).toBe(IssueType.MISSING);
        expect(issue.fixable).toBe(true);
      });
    });
  });
});