import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { PNPMAdapter } from '../adapters/PNPMAdapter';
import { PackageManagerType } from '../core/types';

describe('PNPM Adapter', () => {
  let tempDir: string;
  let pnpmAdapter: PNPMAdapter;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-pnpm-test-'));
    pnpmAdapter = new PNPMAdapter(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
  });

  test('should return PNPM as package manager type', () => {
    expect(pnpmAdapter.getType()).toBe(PackageManagerType.PNPM);
  });

  test('should read valid pnpm-lock.yaml', async () => {
    // Create a valid pnpm-lock.yaml file
    const pnpmLockContent = `lockfileVersion: '6.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

dependencies:
  lodash:
    specifier: ^4.17.21
    version: 4.17.21

devDependencies:
  typescript:
    specifier: ^5.0.0
    version: 5.2.2

packages:

  /lodash@4.17.21:
    resolution: {integrity: sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==}
    dev: false

  /typescript@5.2.2:
    resolution: {integrity: sha512-mI4WrpHsbCIcwT9cF4FZvr80QUeKvsUsUvKDoR+X/7XHQH98xYD8YHZg7ANtz2GtZt/CBq2QJ0thkGJMHfqc1w==}
    engines: {node: '>=14.17'}
    hasBin: true
    dev: true
`;

    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), pnpmLockContent);

    const lockfile = await pnpmAdapter.readLockfile(tempDir);

    expect(lockfile.type).toBe(PackageManagerType.PNPM);
    expect(lockfile.path).toBe(path.join(tempDir, 'pnpm-lock.yaml'));
    expect(lockfile.content.lockfileVersion).toBe('6.0');
    expect(lockfile.content.dependencies).toBeDefined();
    expect(lockfile.content.devDependencies).toBeDefined();
    expect(lockfile.content.packages).toBeDefined();
  });

  test('should throw error when pnpm-lock.yaml is missing', async () => {
    await expect(pnpmAdapter.readLockfile(tempDir)).rejects.toThrow(
      'pnpm-lock.yaml not found'
    );
  });

  test('should throw error when pnpm-lock.yaml is invalid YAML', async () => {
    // Create invalid YAML file
    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'invalid: yaml: content: [');

    await expect(pnpmAdapter.readLockfile(tempDir)).rejects.toThrow(
      'Invalid YAML in pnpm-lock.yaml'
    );
  });

  test('should throw error when pnpm-lock.yaml is missing lockfileVersion', async () => {
    // Create pnpm-lock.yaml without lockfileVersion
    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'dependencies: {}');

    await expect(pnpmAdapter.readLockfile(tempDir)).rejects.toThrow(
      'Invalid pnpm-lock.yaml: missing lockfileVersion'
    );
  });

  test('should parse dependency tree from pnpm-lock.yaml', async () => {
    const pnpmLockContent = `lockfileVersion: '6.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

dependencies:
  lodash:
    specifier: ^4.17.21
    version: 4.17.21
  express:
    specifier: ^4.18.0
    version: 4.18.2

devDependencies:
  typescript:
    specifier: ^5.0.0
    version: 5.2.2
  '@types/node':
    specifier: ^20.0.0
    version: 20.8.0

packages:

  /lodash@4.17.21:
    resolution: {integrity: sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==}
    dev: false

  /express@4.18.2:
    resolution: {integrity: sha512-5/PsL6iGPdfQ/lKM1UuielYgv3BUoJfz1aUwU9vHZ+J7gyvwdQXFEBIEIaxeGf0GIcreATNyBExtalisDbuMqQ==}
    engines: {node: '>= 0.10.0'}
    dependencies:
      accepts: 1.3.8
      array-flatten: 1.1.1
    dev: false

  /typescript@5.2.2:
    resolution: {integrity: sha512-mI4WrpHsbCIcwT9cF4FZvr80QUeKvsUsUvKDoR+X/7XHQH98xYD8YHZg7ANtz2GtZt/CBq2QJ0thkGJMHfqc1w==}
    engines: {node: '>=14.17'}
    hasBin: true
    dev: true

  /@types/node@20.8.0:
    resolution: {integrity: sha512-wmO1QCdw+HgHKDxaCAW3pBOmVOeKlWQQtAcEKbAQlbBnWVjRhoZEP7+jMmBtqD3MkpALl4BaW64Lmr9ba/YlA==}
    dev: true
`;

    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), pnpmLockContent);

    const dependencyTree = await pnpmAdapter.getDependencyTree();

    expect(dependencyTree.lockfileVersion).toBe('6.0');
    expect(dependencyTree.settings.autoInstallPeers).toBe(true);
    
    // Check regular dependencies
    expect(dependencyTree.dependencies.lodash).toBeDefined();
    expect(dependencyTree.dependencies.lodash.specifier).toBe('^4.17.21');
    expect(dependencyTree.dependencies.lodash.version).toBe('4.17.21');
    expect(dependencyTree.dependencies.lodash.isDev).toBe(false);

    expect(dependencyTree.dependencies.express).toBeDefined();
    expect(dependencyTree.dependencies.express.specifier).toBe('^4.18.0');
    expect(dependencyTree.dependencies.express.version).toBe('4.18.2');
    expect(dependencyTree.dependencies.express.isDev).toBe(false);

    // Check dev dependencies
    expect(dependencyTree.devDependencies.typescript).toBeDefined();
    expect(dependencyTree.devDependencies.typescript.specifier).toBe('^5.0.0');
    expect(dependencyTree.devDependencies.typescript.version).toBe('5.2.2');
    expect(dependencyTree.devDependencies.typescript.isDev).toBe(true);

    expect(dependencyTree.devDependencies['@types/node']).toBeDefined();
    expect(dependencyTree.devDependencies['@types/node'].specifier).toBe('^20.0.0');
    expect(dependencyTree.devDependencies['@types/node'].version).toBe('20.8.0');
    expect(dependencyTree.devDependencies['@types/node'].isDev).toBe(true);
  });

  test('should detect pnpm workspaces from pnpm-workspace.yaml', async () => {
    // Create pnpm-workspace.yaml
    const workspaceContent = `packages:
  - 'packages/*'
  - 'apps/*'
  - 'tools/*'
`;

    await fs.writeFile(path.join(tempDir, 'pnpm-workspace.yaml'), workspaceContent);

    const workspaces = await pnpmAdapter.getWorkspaces();
    expect(workspaces).toEqual(['packages/*', 'apps/*', 'tools/*']);

    const isWorkspaceRoot = await pnpmAdapter.isWorkspaceRoot();
    expect(isWorkspaceRoot).toBe(true);
  });

  test('should fallback to package.json workspaces when pnpm-workspace.yaml is missing', async () => {
    // Create package.json with workspaces
    const packageJson = {
      name: 'monorepo-root',
      version: '1.0.0',
      workspaces: ['packages/*', 'libs/*']
    };

    await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

    const workspaces = await pnpmAdapter.getWorkspaces();
    expect(workspaces).toEqual(['packages/*', 'libs/*']);

    const isWorkspaceRoot = await pnpmAdapter.isWorkspaceRoot();
    expect(isWorkspaceRoot).toBe(true);
  });

  test('should return empty workspaces when not configured', async () => {
    // Create package.json without workspaces
    const packageJson = {
      name: 'regular-project',
      version: '1.0.0'
    };

    await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

    const workspaces = await pnpmAdapter.getWorkspaces();
    expect(workspaces).toEqual([]);

    const isWorkspaceRoot = await pnpmAdapter.isWorkspaceRoot();
    expect(isWorkspaceRoot).toBe(false);
  });

  test('should check if lockfile exists', async () => {
    // Initially no lockfile
    expect(await pnpmAdapter.hasLockfile()).toBe(false);

    // Create lockfile
    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: "6.0"\n');

    expect(await pnpmAdapter.hasLockfile()).toBe(true);
  });

  test('should handle workspace importers in dependency tree', async () => {
    const pnpmLockContent = `lockfileVersion: '6.0'

settings:
  autoInstallPeers: true

importers:

  .:
    dependencies:
      lodash:
        specifier: ^4.17.21
        version: 4.17.21
    devDependencies:
      typescript:
        specifier: ^5.0.0
        version: 5.2.2

  packages/app-a:
    dependencies:
      express:
        specifier: ^4.18.0
        version: 4.18.2

  packages/app-b:
    devDependencies:
      jest:
        specifier: ^29.0.0
        version: 29.7.0

packages:

  /lodash@4.17.21:
    resolution: {integrity: sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==}
    dev: false
`;

    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), pnpmLockContent);

    const dependencyTree = await pnpmAdapter.getDependencyTree();

    // Check root dependencies
    expect(dependencyTree.dependencies.lodash).toBeDefined();
    expect(dependencyTree.dependencies.lodash.importer).toBeUndefined(); // Root importer

    expect(dependencyTree.devDependencies.typescript).toBeDefined();
    expect(dependencyTree.devDependencies.typescript.importer).toBeUndefined(); // Root importer

    // Check workspace dependencies
    expect(dependencyTree.dependencies['packages/app-a/express']).toBeDefined();
    expect(dependencyTree.dependencies['packages/app-a/express'].importer).toBe('packages/app-a');
    expect(dependencyTree.dependencies['packages/app-a/express'].isDev).toBe(false);

    expect(dependencyTree.devDependencies['packages/app-b/jest']).toBeDefined();
    expect(dependencyTree.devDependencies['packages/app-b/jest'].importer).toBe('packages/app-b');
    expect(dependencyTree.devDependencies['packages/app-b/jest'].isDev).toBe(true);
  });

  test('should check pnpm availability', async () => {
    // This test depends on pnpm being installed in the test environment
    const isAvailable = await PNPMAdapter.isAvailable();
    expect(typeof isAvailable).toBe('boolean');
  });

  test('should handle different lockfile versions', async () => {
    const pnpmLockContent = `lockfileVersion: 5.4

dependencies:
  lodash: 4.17.21

specifiers:
  lodash: ^4.17.21

packages:

  /lodash/4.17.21:
    resolution: {integrity: sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==}
    dev: false
`;

    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), pnpmLockContent);

    const lockfile = await pnpmAdapter.readLockfile(tempDir);

    expect(lockfile.content.lockfileVersion).toBe(5.4);
    expect(lockfile.content.dependencies).toBeDefined();
    expect(lockfile.content.specifiers).toBeDefined();
  });

  // Note: The following tests for install, update, regenerate, and store operations
  // are commented out because they would actually run pnpm commands
  // In a real test environment, you would mock these or use integration tests

  /*
  test('should install package', async () => {
    // This would actually run pnpm add - use with caution in tests
    // await pnpmAdapter.installPackage('lodash', '4.17.21');
  });

  test('should update package', async () => {
    // This would actually run pnpm update - use with caution in tests
    // await pnpmAdapter.updatePackage('lodash', '4.17.21');
  });

  test('should regenerate lockfile', async () => {
    // This would actually run pnpm install - use with caution in tests
    // await pnpmAdapter.regenerateLockfile();
  });

  test('should get store path', async () => {
    // This would actually run pnpm store path - use with caution in tests
    // const storePath = await pnpmAdapter.getStorePath();
    // expect(typeof storePath).toBe('string');
  });
  */
});