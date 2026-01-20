import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { YarnAdapter } from '../adapters/YarnAdapter';
import { PackageManagerType } from '../core/types';

describe('Yarn Adapter', () => {
  let tempDir: string;
  let yarnAdapter: YarnAdapter;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-yarn-test-'));
    yarnAdapter = new YarnAdapter(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
  });

  test('should return YARN as package manager type', () => {
    expect(yarnAdapter.getType()).toBe(PackageManagerType.YARN);
  });

  test('should read valid yarn.lock', async () => {
    // Create a valid yarn.lock file
    const yarnLockContent = `# yarn lockfile v1

lodash@^4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#679591c564c3bffaae8454cf0b3df370c3d6911c"
  integrity sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==

typescript@^5.0.0:
  version "5.2.2"
  resolved "https://registry.yarnpkg.com/typescript/-/typescript-5.2.2.tgz#faf90581d777e1b5e5b2c9c1b8e5e8b8b8b8b8b8"
  integrity sha512-mI4WrpHsbCIcwT9cF4FZvr80QUeKvsUsUvKDoR+X/7XHQH98xYD8YHZg7ANtz2GtZt/CBq2QJ0thkGJMHfqc1w==
  dependencies:
    lodash "^4.17.20"
`;

    await fs.writeFile(path.join(tempDir, 'yarn.lock'), yarnLockContent);

    const lockfile = await yarnAdapter.readLockfile(tempDir);

    expect(lockfile.type).toBe(PackageManagerType.YARN);
    expect(lockfile.path).toBe(path.join(tempDir, 'yarn.lock'));
    expect(lockfile.content.yarnVersion).toBe('1');
    expect(lockfile.content.dependencies).toBeDefined();
    expect(Object.keys(lockfile.content.dependencies)).toContain('lodash@^4.17.21');
    expect(Object.keys(lockfile.content.dependencies)).toContain('typescript@^5.0.0');
  });

  test('should throw error when yarn.lock is missing', async () => {
    await expect(yarnAdapter.readLockfile(tempDir)).rejects.toThrow(
      'yarn.lock not found'
    );
  });

  test('should parse yarn.lock dependencies correctly', async () => {
    const yarnLockContent = `# yarn lockfile v1

lodash@^4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#679591c564c3bffaae8454cf0b3df370c3d6911c"
  integrity sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==

express@^4.18.0:
  version "4.18.2"
  resolved "https://registry.yarnpkg.com/express/-/express-4.18.2.tgz#3fabe32b7e3c58b8a9c9c8b8b8b8b8b8b8b8b8b8"
  integrity sha512-5/PsL6iGPdfQ/lKM1UuielYgv3BUoJfz1aUwU9vHZ+J7gyvwdQXFEBIEIaxeGf0GIcreATNyBExtalisDbuMqQ==
  dependencies:
    accepts "~1.3.8"
    array-flatten "1.1.1"
`;

    await fs.writeFile(path.join(tempDir, 'yarn.lock'), yarnLockContent);

    const dependencyTree = await yarnAdapter.getDependencyTree();

    expect(dependencyTree.yarnVersion).toBe('1');
    expect(dependencyTree.dependencies['lodash@^4.17.21']).toBeDefined();
    expect(dependencyTree.dependencies['lodash@^4.17.21'].version).toBe('4.17.21');
    expect(dependencyTree.dependencies['lodash@^4.17.21'].resolved).toContain('lodash-4.17.21.tgz');

    expect(dependencyTree.dependencies['express@^4.18.0']).toBeDefined();
    expect(dependencyTree.dependencies['express@^4.18.0'].version).toBe('4.18.2');
    expect(dependencyTree.dependencies['express@^4.18.0'].dependencies).toBeDefined();
    expect(dependencyTree.dependencies['express@^4.18.0'].dependencies?.accepts).toBe('~1.3.8');
  });

  test('should detect yarn workspaces from package.json', async () => {
    // Create package.json with workspaces (array format)
    const packageJson = {
      name: 'monorepo-root',
      version: '1.0.0',
      workspaces: ['packages/*', 'apps/*']
    };

    await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

    const workspaces = await yarnAdapter.getWorkspaces();
    expect(workspaces).toEqual(['packages/*', 'apps/*']);

    const isWorkspaceRoot = await yarnAdapter.isWorkspaceRoot();
    expect(isWorkspaceRoot).toBe(true);
  });

  test('should detect yarn workspaces from package.json (object format)', async () => {
    // Create package.json with workspaces (object format)
    const packageJson = {
      name: 'monorepo-root',
      version: '1.0.0',
      workspaces: {
        packages: ['packages/*', 'tools/*']
      }
    };

    await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

    const workspaces = await yarnAdapter.getWorkspaces();
    expect(workspaces).toEqual(['packages/*', 'tools/*']);

    const isWorkspaceRoot = await yarnAdapter.isWorkspaceRoot();
    expect(isWorkspaceRoot).toBe(true);
  });

  test('should return empty workspaces when not configured', async () => {
    // Create package.json without workspaces
    const packageJson = {
      name: 'regular-project',
      version: '1.0.0'
    };

    await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

    const workspaces = await yarnAdapter.getWorkspaces();
    expect(workspaces).toEqual([]);

    const isWorkspaceRoot = await yarnAdapter.isWorkspaceRoot();
    expect(isWorkspaceRoot).toBe(false);
  });

  test('should handle missing package.json for workspaces', async () => {
    const workspaces = await yarnAdapter.getWorkspaces();
    expect(workspaces).toEqual([]);

    const isWorkspaceRoot = await yarnAdapter.isWorkspaceRoot();
    expect(isWorkspaceRoot).toBe(false);
  });

  test('should check if lockfile exists', async () => {
    // Initially no lockfile
    expect(await yarnAdapter.hasLockfile()).toBe(false);

    // Create lockfile
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');

    expect(await yarnAdapter.hasLockfile()).toBe(true);
  });

  test('should parse yarn.lock with different version formats', async () => {
    const yarnLockContent = `# yarn lockfile v2

"@types/node@^20.0.0":
  version "20.8.0"
  resolved "https://registry.yarnpkg.com/@types/node/-/node-20.8.0.tgz#1234567890abcdef"
  integrity sha512-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef==

lodash@4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#679591c564c3bffaae8454cf0b3df370c3d6911c"
  integrity sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==
`;

    await fs.writeFile(path.join(tempDir, 'yarn.lock'), yarnLockContent);

    const lockfile = await yarnAdapter.readLockfile(tempDir);

    expect(lockfile.content.yarnVersion).toBe('2');
    expect(lockfile.content.dependencies['@types/node@^20.0.0']).toBeDefined();
    expect(lockfile.content.dependencies['@types/node@^20.0.0'].version).toBe('20.8.0');
    expect(lockfile.content.dependencies['lodash@4.17.21']).toBeDefined();
    expect(lockfile.content.dependencies['lodash@4.17.21'].version).toBe('4.17.21');
  });

  test('should handle empty yarn.lock file', async () => {
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n\n');

    const lockfile = await yarnAdapter.readLockfile(tempDir);

    expect(lockfile.content.yarnVersion).toBe('1');
    expect(lockfile.content.dependencies).toEqual({});
    expect(lockfile.content.metadata.totalPackages).toBe(0);
  });

  test('should check yarn availability', async () => {
    // This test depends on yarn being installed in the test environment
    const isAvailable = await YarnAdapter.isAvailable();
    expect(typeof isAvailable).toBe('boolean');
  });

  test('should parse complex yarn.lock with nested dependencies', async () => {
    const yarnLockContent = `# yarn lockfile v1

express@^4.18.0:
  version "4.18.2"
  resolved "https://registry.yarnpkg.com/express/-/express-4.18.2.tgz"
  integrity sha512-5/PsL6iGPdfQ/lKM1UuielYgv3BUoJfz1aUwU9vHZ+J7gyvwdQXFEBIEIaxeGf0GIcreATNyBExtalisDbuMqQ==
  dependencies:
    accepts "~1.3.8"
    array-flatten "1.1.1"
    body-parser "1.20.1"

accepts@~1.3.8:
  version "1.3.8"
  resolved "https://registry.yarnpkg.com/accepts/-/accepts-1.3.8.tgz"
  integrity sha512-PYAthTa2m2VKxuvSD3DPC/Gy+U+sOA1LAuT8mkmRuvw+NACSaeXEQ+NHcVF7rONl6qcaxV3Uuemwawk+7+SJLw==
  dependencies:
    mime-types "~2.1.34"
    negotiator "0.6.3"
`;

    await fs.writeFile(path.join(tempDir, 'yarn.lock'), yarnLockContent);

    const dependencyTree = await yarnAdapter.getDependencyTree();

    expect(dependencyTree.dependencies['express@^4.18.0']).toBeDefined();
    expect(dependencyTree.dependencies['express@^4.18.0'].dependencies).toEqual({
      accepts: '~1.3.8',
      'array-flatten': '1.1.1',
      'body-parser': '1.20.1'
    });

    expect(dependencyTree.dependencies['accepts@~1.3.8']).toBeDefined();
    expect(dependencyTree.dependencies['accepts@~1.3.8'].dependencies).toEqual({
      'mime-types': '~2.1.34',
      negotiator: '0.6.3'
    });
  });

  // Note: The following tests for install, update, and regenerate operations
  // are commented out because they would actually run yarn commands
  // In a real test environment, you would mock these or use integration tests

  /*
  test('should install package', async () => {
    // This would actually run yarn add - use with caution in tests
    // await yarnAdapter.installPackage('lodash', '4.17.21');
  });

  test('should update package', async () => {
    // This would actually run yarn upgrade - use with caution in tests
    // await yarnAdapter.updatePackage('lodash', '4.17.21');
  });

  test('should regenerate lockfile', async () => {
    // This would actually run yarn install - use with caution in tests
    // await yarnAdapter.regenerateLockfile();
  });
  */
});