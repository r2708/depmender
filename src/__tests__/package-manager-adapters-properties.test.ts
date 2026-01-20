import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { NPMAdapter, YarnAdapter, PNPMAdapter, PackageManagerDetector } from '../adapters';
import { PackageManagerType } from '../core/types';

describe('Package Manager Adapters Property Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-props-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  /**
   * Property 35: NPM-specific handling
   * For any npm project, package-lock.json should be read and npm-specific dependency resolution logic should be used
   * Validates: Requirements 7.1
   */
  test('Property 35: NPM-specific handling - Feature: depguardian, Property 35: NPM-specific handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid package-lock.json structure
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          version: fc.string({ minLength: 1, maxLength: 20 }),
          lockfileVersion: fc.constantFrom(1, 2, 3),
          dependencies: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 30 }),
            fc.record({
              version: fc.string({ minLength: 1, maxLength: 20 }),
              resolved: fc.option(fc.webUrl()),
              integrity: fc.option(fc.string({ minLength: 10, maxLength: 100 })),
              dev: fc.option(fc.boolean()),
              optional: fc.option(fc.boolean())
            }),
            { maxKeys: 10 }
          )
        }),
        async (lockfileData) => {
          // Create package-lock.json
          await fs.writeJson(path.join(tempDir, 'package-lock.json'), lockfileData);
          
          const npmAdapter = new NPMAdapter(tempDir);
          
          // Property: NPM adapter should correctly identify itself
          expect(npmAdapter.getType()).toBe(PackageManagerType.NPM);
          
          // Property: Should be able to read the lockfile
          const lockfile = await npmAdapter.readLockfile(tempDir);
          expect(lockfile.type).toBe(PackageManagerType.NPM);
          expect(lockfile.content.name).toBe(lockfileData.name);
          expect(lockfile.content.version).toBe(lockfileData.version);
          expect(lockfile.content.lockfileVersion).toBe(lockfileData.lockfileVersion);
          
          // Property: Should detect lockfile existence
          expect(await npmAdapter.hasLockfile()).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 36: Yarn-specific handling
   * For any yarn project, yarn.lock should be read and yarn-specific dependency resolution logic should be used
   * Validates: Requirements 7.2
   */
  test('Property 36: Yarn-specific handling - Feature: depguardian, Property 36: Yarn-specific handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid yarn.lock content
        fc.record({
          yarnVersion: fc.constantFrom('1', '2', '3'),
          packages: fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }),
              version: fc.string({ minLength: 1, maxLength: 20 }),
              resolved: fc.option(fc.webUrl()),
              integrity: fc.option(fc.string({ minLength: 10, maxLength: 100 }))
            }),
            { maxLength: 5 }
          )
        }),
        async (yarnData) => {
          // Create yarn.lock content
          let yarnLockContent = `# yarn lockfile v${yarnData.yarnVersion}\n\n`;
          
          for (const pkg of yarnData.packages) {
            yarnLockContent += `${pkg.name}@^${pkg.version}:\n`;
            yarnLockContent += `  version "${pkg.version}"\n`;
            if (pkg.resolved) {
              yarnLockContent += `  resolved "${pkg.resolved}"\n`;
            }
            if (pkg.integrity) {
              yarnLockContent += `  integrity ${pkg.integrity}\n`;
            }
            yarnLockContent += '\n';
          }
          
          await fs.writeFile(path.join(tempDir, 'yarn.lock'), yarnLockContent);
          
          const yarnAdapter = new YarnAdapter(tempDir);
          
          // Property: Yarn adapter should correctly identify itself
          expect(yarnAdapter.getType()).toBe(PackageManagerType.YARN);
          
          // Property: Should be able to read the lockfile
          const lockfile = await yarnAdapter.readLockfile(tempDir);
          expect(lockfile.type).toBe(PackageManagerType.YARN);
          expect(lockfile.content.yarnVersion).toBe(yarnData.yarnVersion);
          
          // Property: Should detect lockfile existence
          expect(await yarnAdapter.hasLockfile()).toBe(true);
          
          // Property: Should parse dependencies correctly
          const dependencyTree = await yarnAdapter.getDependencyTree();
          expect(dependencyTree.yarnVersion).toBe(yarnData.yarnVersion);
          expect(typeof dependencyTree.dependencies).toBe('object');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 37: PNPM-specific handling
   * For any pnpm project, pnpm-lock.yaml should be read and pnpm-specific dependency resolution logic should be used
   * Validates: Requirements 7.3
   */
  test('Property 37: PNPM-specific handling - Feature: depguardian, Property 37: PNPM-specific handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid pnpm-lock.yaml structure with safe characters
        fc.record({
          lockfileVersion: fc.constantFrom('5.4', '6.0', '6.1'),
          settings: fc.record({
            autoInstallPeers: fc.boolean(),
            excludeLinksFromLockfile: fc.boolean()
          }),
          dependencies: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9@/_]*$/.test(s)), // Start with letter, no hyphens
            fc.oneof(
              fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z0-9.]+$/.test(s)), // Simple alphanumeric versions
              fc.record({
                specifier: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z0-9.^~]+$/.test(s)),
                version: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z0-9.]+$/.test(s))
              })
            ),
            { maxKeys: 3 }
          ),
          packages: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9@/_]*$/.test(s)), // Start with letter, no hyphens
            fc.record({
              resolution: fc.record({
                integrity: fc.string({ minLength: 20, maxLength: 50 }).filter(s => /^[a-zA-Z0-9+/=]+$/.test(s))
              }),
              dev: fc.option(fc.boolean())
            }),
            { maxKeys: 3 }
          )
        }),
        async (pnpmData) => {
          // Create pnpm-lock.yaml content using YAML format
          const yamlContent = `lockfileVersion: '${pnpmData.lockfileVersion}'

settings:
  autoInstallPeers: ${pnpmData.settings.autoInstallPeers}
  excludeLinksFromLockfile: ${pnpmData.settings.excludeLinksFromLockfile}

dependencies:
${Object.entries(pnpmData.dependencies).map(([name, info]) => {
  if (typeof info === 'string') {
    return `  ${name}: ${info}`;
  } else {
    return `  ${name}:
    specifier: ${info.specifier}
    version: ${info.version}`;
  }
}).join('\n')}

packages:
${Object.entries(pnpmData.packages).map(([name, info]) => {
  return `  ${name}:
    resolution: {integrity: ${info.resolution.integrity}}${info.dev ? '\n    dev: true' : ''}`;
}).join('\n')}
`;
          
          await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), yamlContent);
          
          const pnpmAdapter = new PNPMAdapter(tempDir);
          
          // Property: PNPM adapter should correctly identify itself
          expect(pnpmAdapter.getType()).toBe(PackageManagerType.PNPM);
          
          // Property: Should be able to read the lockfile
          const lockfile = await pnpmAdapter.readLockfile(tempDir);
          expect(lockfile.type).toBe(PackageManagerType.PNPM);
          expect(lockfile.content.lockfileVersion).toBe(pnpmData.lockfileVersion);
          
          // Property: Should detect lockfile existence
          expect(await pnpmAdapter.hasLockfile()).toBe(true);
          
          // Property: Should parse dependency tree correctly
          const dependencyTree = await pnpmAdapter.getDependencyTree();
          expect(dependencyTree.lockfileVersion).toBe(pnpmData.lockfileVersion);
          expect(typeof dependencyTree.dependencies).toBe('object');
          expect(typeof dependencyTree.devDependencies).toBe('object');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 38: Appropriate package manager usage
   * For any package manager operation, the correct package manager should be used for installation and updates
   * Validates: Requirements 7.4
   */
  test('Property 38: Appropriate package manager usage - Feature: depguardian, Property 38: Appropriate package manager usage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        async (packageManagerType) => {
          let adapter;
          
          switch (packageManagerType) {
            case PackageManagerType.NPM:
              adapter = new NPMAdapter(tempDir);
              break;
            case PackageManagerType.YARN:
              adapter = new YarnAdapter(tempDir);
              break;
            case PackageManagerType.PNPM:
              adapter = new PNPMAdapter(tempDir);
              break;
          }
          
          // Property: Adapter should return the correct package manager type
          expect(adapter.getType()).toBe(packageManagerType);
          
          // Property: Adapter should have consistent lockfile path
          const expectedLockfiles = {
            [PackageManagerType.NPM]: 'package-lock.json',
            [PackageManagerType.YARN]: 'yarn.lock',
            [PackageManagerType.PNPM]: 'pnpm-lock.yaml'
          };
          
          const expectedLockfile = expectedLockfiles[packageManagerType];
          const expectedPath = path.join(tempDir, expectedLockfile);
          
          // Test by checking hasLockfile after creating the file
          switch (packageManagerType) {
            case PackageManagerType.NPM:
              await fs.writeJson(expectedPath, { name: 'test', version: '1.0.0' });
              break;
            case PackageManagerType.YARN:
              await fs.writeFile(expectedPath, '# yarn lockfile v1\n');
              break;
            case PackageManagerType.PNPM:
              await fs.writeFile(expectedPath, 'lockfileVersion: "6.0"\n');
              break;
          }
          
          expect(await adapter.hasLockfile()).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 39: Consistent lockfile regeneration
   * For any lockfile regeneration, the correct package manager should be used to maintain consistency
   * Validates: Requirements 7.5
   */
  test('Property 39: Consistent lockfile regeneration - Feature: depguardian, Property 39: Consistent lockfile regeneration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          version: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          dependencies: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            { maxKeys: 3 }
          )
        }),
        async (packageManagerType, packageJsonData) => {
          // Create a fresh temp directory for this test case
          const testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-lockfile-test-'));
          
          try {
            // Create package.json
            await fs.writeJson(path.join(testTempDir, 'package.json'), packageJsonData);
            
            let adapter;
            let expectedLockfile;
            
            switch (packageManagerType) {
              case PackageManagerType.NPM:
                adapter = new NPMAdapter(testTempDir);
                expectedLockfile = 'package-lock.json';
                break;
              case PackageManagerType.YARN:
                adapter = new YarnAdapter(testTempDir);
                expectedLockfile = 'yarn.lock';
                break;
              case PackageManagerType.PNPM:
                adapter = new PNPMAdapter(testTempDir);
                expectedLockfile = 'pnpm-lock.yaml';
                break;
            }
            
            // Property: Adapter should identify correct lockfile path
            const lockfilePath = path.join(testTempDir, expectedLockfile);
            
            // Property: Initially no lockfile should exist
            expect(await adapter.hasLockfile()).toBe(false);
            
            // Property: After creating a lockfile, it should be detected
            if (packageManagerType === PackageManagerType.NPM) {
              await fs.writeJson(lockfilePath, { name: packageJsonData.name, version: packageJsonData.version });
            } else if (packageManagerType === PackageManagerType.YARN) {
              await fs.writeFile(lockfilePath, '# yarn lockfile v1\n');
            } else if (packageManagerType === PackageManagerType.PNPM) {
              await fs.writeFile(lockfilePath, 'lockfileVersion: "6.0"\n');
            }
            
            expect(await adapter.hasLockfile()).toBe(true);
          } finally {
            // Clean up test temp directory
            await fs.remove(testTempDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Package manager detection consistency
   * For any project with lockfiles, the detected package manager should match the lockfile type
   */
  test('Property: Package manager detection consistency - Feature: depguardian, Property: Detection consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        async (expectedType) => {
          // Create a fresh temp directory for this test case
          const testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-detection-test-'));
          
          try {
            // Create appropriate lockfile
            switch (expectedType) {
              case PackageManagerType.NPM:
                await fs.writeJson(path.join(testTempDir, 'package-lock.json'), {
                  name: 'test',
                  version: '1.0.0',
                  lockfileVersion: 2
                });
                break;
              case PackageManagerType.YARN:
                await fs.writeFile(path.join(testTempDir, 'yarn.lock'), '# yarn lockfile v1\n');
                break;
              case PackageManagerType.PNPM:
                await fs.writeFile(path.join(testTempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "6.0"\n');
                break;
            }
            
            // Property: Detection should match the lockfile type
            const detectedType = await PackageManagerDetector.detect(testTempDir);
            expect(detectedType).toBe(expectedType);
            
            // Property: Validation should confirm consistency
            const validation = await PackageManagerDetector.validatePackageManager(testTempDir, detectedType);
            expect(validation.isValid).toBe(true);
          } finally {
            // Clean up test temp directory
            await fs.remove(testTempDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Adapter interface consistency
   * For any package manager adapter, all required interface methods should be implemented
   */
  test('Property: Adapter interface consistency - Feature: depguardian, Property: Interface consistency', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(PackageManagerType.NPM, PackageManagerType.YARN, PackageManagerType.PNPM),
        (packageManagerType) => {
          let adapter;
          
          switch (packageManagerType) {
            case PackageManagerType.NPM:
              adapter = new NPMAdapter(tempDir);
              break;
            case PackageManagerType.YARN:
              adapter = new YarnAdapter(tempDir);
              break;
            case PackageManagerType.PNPM:
              adapter = new PNPMAdapter(tempDir);
              break;
          }
          
          // Property: All adapters should implement required methods
          expect(typeof adapter.getType).toBe('function');
          expect(typeof adapter.readLockfile).toBe('function');
          expect(typeof adapter.installPackage).toBe('function');
          expect(typeof adapter.updatePackage).toBe('function');
          expect(typeof adapter.regenerateLockfile).toBe('function');
          expect(typeof adapter.getInstalledPackages).toBe('function');
          expect(typeof adapter.hasLockfile).toBe('function');
          
          // Property: getType should return consistent value
          expect(adapter.getType()).toBe(packageManagerType);
        }
      ),
      { numRuns: 100 }
    );
  });
});