import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { PeerConflictScanner } from '../scanners/PeerConflictScanner';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { IssueType, IssueSeverity, PackageManagerType } from '../core/types';

describe('PeerConflictScanner Property Tests', () => {
  let tempDir: string;
  let scanner: PeerConflictScanner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-peer-conflict-test-'));
    scanner = new PeerConflictScanner();
    
    // Suppress console warnings during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /**
   * Property 6: Peer conflict detection
   * For any project, all incompatible peer dependency requirements should be identified as conflicts
   * Validates: Requirements 1.6
   */
  test('Property 6: Peer conflict detection - Feature: depguardian, Property 6: Peer conflict detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.constantFrom('react', 'lodash', 'typescript'),
        fc.constantFrom('^16.0.0', '^17.0.0', '^18.0.0'),
        async (packageManagerType, packageName1, packageName2, peerName, peerRange) => {
          // Ensure package names are different
          if (packageName1 === packageName2) {
            return;
          }

          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName1]: '^1.0.0',
              [packageName2]: '^1.0.0'
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
          
          // Create first package with peer dependency
          const package1Path = path.join(tempDir, 'node_modules', packageName1);
          await fs.ensureDir(package1Path);
          await fs.writeJson(path.join(package1Path, 'package.json'), {
            name: packageName1,
            version: '1.0.0',
            peerDependencies: {
              [peerName]: peerRange
            }
          });

          // Create second package with potentially conflicting peer dependency
          const package2Path = path.join(tempDir, 'node_modules', packageName2);
          await fs.ensureDir(package2Path);
          await fs.writeJson(path.join(package2Path, 'package.json'), {
            name: packageName2,
            version: '1.0.0',
            peerDependencies: {
              [peerName]: peerRange // Same range for this test
            }
          });

          // Add packages to context
          context.nodeModules.packages = [
            {
              name: packageName1,
              version: '1.0.0',
              path: package1Path,
              isValid: true
            },
            {
              name: packageName2,
              version: '1.0.0',
              path: package2Path,
              isValid: true
            }
          ];

          const result = await scanner.scan(context);

          // Property: Scanner should return correct scanner type
          expect(result.scannerType).toBe('peer-conflicts');
          
          // Property: Result should have proper structure
          expect(result).toHaveProperty('scannerType');
          expect(result).toHaveProperty('issues');
          expect(result).toHaveProperty('securityIssues');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);

          // Property: All detected issues should be PEER_CONFLICT type
          result.issues.forEach(issue => {
            expect(issue.type).toBe(IssueType.PEER_CONFLICT);
            expect(issue.packageName).toBe(peerName);
            expect(Object.values(IssueSeverity)).toContain(issue.severity);
            expect(typeof issue.description).toBe('string');
            expect(issue.description.length).toBeGreaterThan(0);
            expect(typeof issue.fixable).toBe('boolean');
          });

          // Property: Missing peer dependencies should be detected
          // Since we didn't install the peer dependency, it should be reported as missing
          const missingPeerIssues = result.issues.filter(issue => 
            issue.packageName === peerName && 
            issue.currentVersion === undefined
          );
          
          expect(missingPeerIssues.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Missing peer dependency detection
   * For any package with peer dependencies that are not installed, they should be detected
   */
  test('Property: Missing peer dependency detection - Feature: depguardian, Property: Missing peer dependency detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.constantFrom('^1.0.0', '~2.1.0', '>=0.5.0'),
        async (packageName, peerName, peerRange) => {
          // Ensure names are different
          if (packageName === peerName) {
            return;
          }

          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: '^1.0.0'
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          
          // Create package with peer dependency
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          await fs.writeJson(path.join(packagePath, 'package.json'), {
            name: packageName,
            version: '1.0.0',
            peerDependencies: {
              [peerName]: peerRange
            }
          });

          context.nodeModules.packages = [{
            name: packageName,
            version: '1.0.0',
            path: packagePath,
            isValid: true
          }];

          // Don't install the peer dependency

          const result = await scanner.scan(context);

          // Property: Missing peer dependency should be detected
          const missingPeerIssues = result.issues.filter(issue => 
            issue.type === IssueType.PEER_CONFLICT && 
            issue.packageName === peerName &&
            issue.currentVersion === undefined
          );

          expect(missingPeerIssues.length).toBeGreaterThan(0);
          
          missingPeerIssues.forEach(issue => {
            expect(issue.expectedVersion).toBe(peerRange);
            expect(issue.fixable).toBe(true);
            expect(issue.description).toContain('not installed');
          });
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Version mismatch peer conflict detection
   * For any peer dependency with installed version that doesn't satisfy the range, it should be detected
   */
  test('Property: Version mismatch detection - Feature: depguardian, Property: Version mismatch detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        async (packageName, peerName) => {
          // Ensure names are different
          if (packageName === peerName) {
            return;
          }

          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: '^1.0.0',
              [peerName]: '^1.0.0' // Install peer dependency
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          
          // Create package that requires a different version of peer
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          await fs.writeJson(path.join(packagePath, 'package.json'), {
            name: packageName,
            version: '1.0.0',
            peerDependencies: {
              [peerName]: '^2.0.0' // Requires version 2, but we'll install version 1
            }
          });

          // Install peer dependency with incompatible version
          const peerPath = path.join(tempDir, 'node_modules', peerName);
          await fs.ensureDir(peerPath);
          await fs.writeJson(path.join(peerPath, 'package.json'), {
            name: peerName,
            version: '1.0.0' // Version 1, but package requires version 2
          });

          context.nodeModules.packages = [
            {
              name: packageName,
              version: '1.0.0',
              path: packagePath,
              isValid: true
            },
            {
              name: peerName,
              version: '1.0.0',
              path: peerPath,
              isValid: true
            }
          ];

          const result = await scanner.scan(context);

          // Property: Version mismatch should be detected
          const versionMismatchIssues = result.issues.filter(issue => 
            issue.type === IssueType.PEER_CONFLICT && 
            issue.packageName === peerName &&
            issue.currentVersion === '1.0.0'
          );

          expect(versionMismatchIssues.length).toBeGreaterThan(0);
          
          versionMismatchIssues.forEach(issue => {
            expect(issue.expectedVersion).toBe('^2.0.0');
            expect(issue.fixable).toBe(true);
            expect(issue.description).toContain('does not satisfy');
          });
        }
      ),
      { numRuns: 3 }
    );
  });

  /**
   * Property: Optional peer dependency handling
   * For any optional peer dependency, conflicts should have appropriate severity
   */
  test('Property: Optional peer dependency handling - Feature: depguardian, Property: Optional peer dependency handling', async () => {
    const packageName = 'test-package';
    const peerName = 'optional-peer';
    
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        [packageName]: '^1.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    
    // Create package with optional peer dependency
    const packagePath = path.join(tempDir, 'node_modules', packageName);
    await fs.ensureDir(packagePath);
    await fs.writeJson(path.join(packagePath, 'package.json'), {
      name: packageName,
      version: '1.0.0',
      peerDependencies: {
        [peerName]: '^1.0.0'
      },
      peerDependenciesMeta: {
        [peerName]: {
          optional: true
        }
      }
    });

    context.nodeModules.packages = [{
      name: packageName,
      version: '1.0.0',
      path: packagePath,
      isValid: true
    }];

    const result = await scanner.scan(context);

    // Property: Optional peer dependencies should not generate conflicts when missing
    // or should have lower severity
    const optionalPeerIssues = result.issues.filter(issue => 
      issue.type === IssueType.PEER_CONFLICT && 
      issue.packageName === peerName
    );

    // Optional peer dependencies might not generate issues when missing,
    // or if they do, they should have lower severity
    optionalPeerIssues.forEach(issue => {
      expect([IssueSeverity.LOW, IssueSeverity.MEDIUM]).toContain(issue.severity);
    });
  });

  /**
   * Property: Scanner consistency across package managers
   * For any peer conflict scenario, the scanner should behave consistently regardless of package manager
   */
  test('Property: Package manager consistency - Feature: depguardian, Property: Package manager consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
        async (packageManagerType, packageName) => {
          const peerName = 'peer-dependency';
          
          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [packageName]: '^1.0.0'
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson, packageManagerType);
          
          // Create package with peer dependency
          const packagePath = path.join(tempDir, 'node_modules', packageName);
          await fs.ensureDir(packagePath);
          await fs.writeJson(path.join(packagePath, 'package.json'), {
            name: packageName,
            version: '1.0.0',
            peerDependencies: {
              [peerName]: '^1.0.0'
            }
          });

          context.nodeModules.packages = [{
            name: packageName,
            version: '1.0.0',
            path: packagePath,
            isValid: true
          }];

          const result = await scanner.scan(context);

          // Property: Scanner behavior should be consistent across package managers
          expect(result.scannerType).toBe('peer-conflicts');
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
   * Property: No false positives for satisfied peer dependencies
   * For any peer dependency that is properly installed and satisfies the range, no conflict should be detected
   */
  test('Property: No false positives - Feature: depguardian, Property: No false positives', async () => {
    const packageName = 'test-package';
    const peerName = 'satisfied-peer';
    const peerVersion = '1.5.0';
    const peerRange = '^1.0.0';
    
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        [packageName]: '^1.0.0',
        [peerName]: peerRange
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    
    // Create package with peer dependency
    const packagePath = path.join(tempDir, 'node_modules', packageName);
    await fs.ensureDir(packagePath);
    await fs.writeJson(path.join(packagePath, 'package.json'), {
      name: packageName,
      version: '1.0.0',
      peerDependencies: {
        [peerName]: peerRange
      }
    });

    // Install peer dependency with compatible version
    const peerPath = path.join(tempDir, 'node_modules', peerName);
    await fs.ensureDir(peerPath);
    await fs.writeJson(path.join(peerPath, 'package.json'), {
      name: peerName,
      version: peerVersion // This satisfies ^1.0.0
    });

    context.nodeModules.packages = [
      {
        name: packageName,
        version: '1.0.0',
        path: packagePath,
        isValid: true
      },
      {
        name: peerName,
        version: peerVersion,
        path: peerPath,
        isValid: true
      }
    ];

    const result = await scanner.scan(context);

    // Property: No conflicts should be detected for satisfied peer dependencies
    const peerConflictIssues = result.issues.filter(issue => 
      issue.type === IssueType.PEER_CONFLICT && 
      issue.packageName === peerName
    );

    expect(peerConflictIssues.length).toBe(0);
  });
});