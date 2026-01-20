import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { NPMAdapter } from '../adapters/NPMAdapter';
import { PackageManagerType } from '../core/types';

describe('NPM Adapter', () => {
  let tempDir: string;
  let npmAdapter: NPMAdapter;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-npm-test-'));
    npmAdapter = new NPMAdapter(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
  });

  test('should return NPM as package manager type', () => {
    expect(npmAdapter.getType()).toBe(PackageManagerType.NPM);
  });

  test('should read valid package-lock.json', async () => {
    // Create a valid package-lock.json
    const lockfileContent = {
      name: 'test-project',
      version: '1.0.0',
      lockfileVersion: 2,
      requires: true,
      packages: {
        '': {
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'lodash': '^4.17.21'
          }
        },
        'node_modules/lodash': {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          integrity: 'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg=='
        }
      },
      dependencies: {
        lodash: {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          integrity: 'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg=='
        }
      }
    };

    await fs.writeJson(path.join(tempDir, 'package-lock.json'), lockfileContent);

    const lockfile = await npmAdapter.readLockfile(tempDir);

    expect(lockfile.type).toBe(PackageManagerType.NPM);
    expect(lockfile.content.name).toBe('test-project');
    expect(lockfile.content.version).toBe('1.0.0');
    expect(lockfile.content.lockfileVersion).toBe(2);
    expect(lockfile.path).toBe(path.join(tempDir, 'package-lock.json'));
  });

  test('should throw error when package-lock.json is missing', async () => {
    await expect(npmAdapter.readLockfile(tempDir)).rejects.toThrow(
      'package-lock.json not found'
    );
  });

  test('should throw error when package-lock.json is invalid JSON', async () => {
    // Create invalid JSON file
    await fs.writeFile(path.join(tempDir, 'package-lock.json'), '{ invalid json }');

    await expect(npmAdapter.readLockfile(tempDir)).rejects.toThrow(
      'Invalid JSON in package-lock.json'
    );
  });

  test('should throw error when package-lock.json is missing required fields', async () => {
    // Create package-lock.json without name or version
    await fs.writeJson(path.join(tempDir, 'package-lock.json'), {
      lockfileVersion: 2
    });

    await expect(npmAdapter.readLockfile(tempDir)).rejects.toThrow(
      'Invalid package-lock.json: missing name or version'
    );
  });

  test('should read package.json correctly', async () => {
    // Create a valid package.json
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'lodash': '^4.17.21'
      },
      devDependencies: {
        'typescript': '^5.0.0'
      }
    };

    await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

    const result = await npmAdapter.readPackageJson();

    expect(result.name).toBe('test-project');
    expect(result.version).toBe('1.0.0');
    expect(result.dependencies?.lodash).toBe('^4.17.21');
    expect(result.devDependencies?.typescript).toBe('^5.0.0');
  });

  test('should get installed packages from node_modules', async () => {
    // Create mock node_modules structure
    const nodeModulesPath = path.join(tempDir, 'node_modules');
    
    // Create lodash package
    const lodashPath = path.join(nodeModulesPath, 'lodash');
    await fs.ensureDir(lodashPath);
    await fs.writeJson(path.join(lodashPath, 'package.json'), {
      name: 'lodash',
      version: '4.17.21'
    });

    // Create scoped package @types/node
    const typesPath = path.join(nodeModulesPath, '@types');
    const typesNodePath = path.join(typesPath, 'node');
    await fs.ensureDir(typesNodePath);
    await fs.writeJson(path.join(typesNodePath, 'package.json'), {
      name: '@types/node',
      version: '20.8.0'
    });

    const installedPackages = await npmAdapter.getInstalledPackages(tempDir);

    expect(installedPackages).toHaveLength(2);
    
    const lodashPackage = installedPackages.find(pkg => pkg.name === 'lodash');
    expect(lodashPackage).toBeDefined();
    expect(lodashPackage?.version).toBe('4.17.21');
    expect(lodashPackage?.isValid).toBe(true);

    const typesNodePackage = installedPackages.find(pkg => pkg.name === '@types/node');
    expect(typesNodePackage).toBeDefined();
    expect(typesNodePackage?.version).toBe('20.8.0');
    expect(typesNodePackage?.isValid).toBe(true);
  });

  test('should handle missing node_modules directory', async () => {
    const installedPackages = await npmAdapter.getInstalledPackages(tempDir);
    expect(installedPackages).toHaveLength(0);
  });

  test('should handle packages without package.json', async () => {
    // Create node_modules with a directory but no package.json
    const nodeModulesPath = path.join(tempDir, 'node_modules');
    const brokenPackagePath = path.join(nodeModulesPath, 'broken-package');
    await fs.ensureDir(brokenPackagePath);

    const installedPackages = await npmAdapter.getInstalledPackages(tempDir);

    expect(installedPackages).toHaveLength(1);
    const brokenPackage = installedPackages[0];
    expect(brokenPackage.name).toBe('broken-package');
    expect(brokenPackage.version).toBe('unknown');
    expect(brokenPackage.isValid).toBe(false);
  });

  test('should check if lockfile exists', async () => {
    // Initially no lockfile
    expect(await npmAdapter.hasLockfile()).toBe(false);

    // Create lockfile
    await fs.writeJson(path.join(tempDir, 'package-lock.json'), {
      name: 'test',
      version: '1.0.0'
    });

    expect(await npmAdapter.hasLockfile()).toBe(true);
  });

  test('should parse dependency tree from package-lock.json', async () => {
    // Create a comprehensive package-lock.json
    const lockfileContent = {
      name: 'test-project',
      version: '1.0.0',
      lockfileVersion: 2,
      requires: true,
      packages: {
        '': {
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'lodash': '^4.17.21'
          },
          devDependencies: {
            'typescript': '^5.0.0'
          }
        },
        'node_modules/lodash': {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          integrity: 'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg=='
        },
        'node_modules/typescript': {
          version: '5.2.2',
          resolved: 'https://registry.npmjs.org/typescript/-/typescript-5.2.2.tgz',
          integrity: 'sha512-mI4WrpHsbCIcwT9cF4FZvr80QUeKvsUsUvKDoR+X/7XHQH98xYD8YHZg7ANtz2GtZt/CBq2QJ0thkGJMHfqc1w==',
          dev: true,
          engines: {
            node: '>=14.17'
          }
        }
      },
      dependencies: {
        lodash: {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          integrity: 'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg=='
        },
        typescript: {
          version: '5.2.2',
          resolved: 'https://registry.npmjs.org/typescript/-/typescript-5.2.2.tgz',
          integrity: 'sha512-mI4WrpHsbCIcwT9cF4FZvr80QUeKvsUsUvKDoR+X/7XHQH98xYD8YHZg7ANtz2GtZt/CBq2QJ0thkGJMHfqc1w==',
          dev: true
        }
      }
    };

    await fs.writeJson(path.join(tempDir, 'package-lock.json'), lockfileContent);

    const dependencyTree = await npmAdapter.getDependencyTree();

    expect(dependencyTree.name).toBe('test-project');
    expect(dependencyTree.version).toBe('1.0.0');
    expect(dependencyTree.lockfileVersion).toBe(2);
    
    // Check packages (v2 format)
    expect(dependencyTree.packages).toHaveLength(2); // lodash and typescript
    
    const lodashPackage = dependencyTree.packages.find(pkg => pkg.name === 'lodash');
    expect(lodashPackage).toBeDefined();
    expect(lodashPackage?.version).toBe('4.17.21');
    expect(lodashPackage?.dev).toBe(false);

    const typescriptPackage = dependencyTree.packages.find(pkg => pkg.name === 'typescript');
    expect(typescriptPackage).toBeDefined();
    expect(typescriptPackage?.version).toBe('5.2.2');
    expect(typescriptPackage?.dev).toBe(true);
    expect(typescriptPackage?.engines.node).toBe('>=14.17');

    // Check dependencies (v1 format)
    expect(dependencyTree.dependencies).toHaveLength(2);
    
    const lodashDep = dependencyTree.dependencies.find(dep => dep.name === 'lodash');
    expect(lodashDep).toBeDefined();
    expect(lodashDep?.version).toBe('4.17.21');
    expect(lodashDep?.dev).toBe(false);
  });

  test('should check npm availability', async () => {
    // This test depends on npm being installed in the test environment
    // In a real CI environment, you might want to mock this
    const isAvailable = await NPMAdapter.isAvailable();
    expect(typeof isAvailable).toBe('boolean');
  });

  // Note: The following tests for install, update, and regenerate operations
  // are commented out because they would actually run npm commands
  // In a real test environment, you would mock these or use integration tests

  /*
  test('should install package', async () => {
    // This would actually run npm install - use with caution in tests
    // await npmAdapter.installPackage('lodash', '4.17.21');
  });

  test('should update package', async () => {
    // This would actually run npm update - use with caution in tests
    // await npmAdapter.updatePackage('lodash', '4.17.21');
  });

  test('should regenerate lockfile', async () => {
    // This would actually run npm install - use with caution in tests
    // await npmAdapter.regenerateLockfile();
  });
  */
});