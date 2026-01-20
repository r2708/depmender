import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ScannerRegistry } from '../scanners/ScannerRegistry';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { OutdatedScanner } from '../scanners/OutdatedScanner';
import { MissingScanner } from '../scanners/MissingScanner';
import { ScannerType, PackageManagerType } from '../core/types';

// Mock fetch to avoid network calls in tests
jest.mock('node-fetch');
const mockFetch = require('node-fetch') as jest.MockedFunction<typeof import('node-fetch').default>;

describe('Core Scanning Functionality Integration Tests', () => {
  let tempDir: string;
  let registry: ScannerRegistry;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-integration-test-'));
    registry = new ScannerRegistry();
    
    // Mock fetch to return 404 (package not found) to avoid network calls
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as any);
    
    // Suppress console warnings during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('Scanner registry can register and manage scanners', () => {
    const outdatedScanner = new OutdatedScanner();
    const missingScanner = new MissingScanner();

    // Test registration
    registry.register(outdatedScanner);
    registry.register(missingScanner);

    // Verify registration
    expect(registry.getCount()).toBe(2);
    expect(registry.isRegistered(ScannerType.OUTDATED)).toBe(true);
    expect(registry.isRegistered(ScannerType.MISSING)).toBe(true);
    
    // Verify scanner retrieval
    expect(registry.getScanner(ScannerType.OUTDATED)).toBe(outdatedScanner);
    expect(registry.getScanner(ScannerType.MISSING)).toBe(missingScanner);
    
    // Verify registered types
    const registeredTypes = registry.getRegisteredTypes();
    expect(registeredTypes).toContain(ScannerType.OUTDATED);
    expect(registeredTypes).toContain(ScannerType.MISSING);
  });

  test('Scanner registry prevents duplicate registrations', () => {
    const scanner1 = new OutdatedScanner();
    const scanner2 = new OutdatedScanner();

    registry.register(scanner1);
    
    expect(() => {
      registry.register(scanner2);
    }).toThrow('Scanner of type outdated is already registered');
  });

  test('Core scanning functionality works end-to-end', async () => {
    // Create a test project with mixed dependency issues
    const packageJson = {
      name: 'test-integration-project',
      version: '1.0.0',
      dependencies: {
        'installed-package': '^1.0.0',
        'missing-package': '^2.0.0'
      },
      devDependencies: {
        'missing-dev-package': '^3.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson, PackageManagerType.NPM);
    
    // Simulate only one package being installed
    context.nodeModules.packages = [{
      name: 'installed-package',
      version: '1.0.0',
      path: path.join(tempDir, 'node_modules', 'installed-package'),
      isValid: true
    }];

    // Register scanners
    const outdatedScanner = new OutdatedScanner();
    const missingScanner = new MissingScanner();
    
    registry.register(outdatedScanner);
    registry.register(missingScanner);

    // Run all scanners
    const results = await registry.runAllScanners(context);

    // Verify results
    expect(results).toHaveLength(2);
    
    // Find results by scanner type
    const outdatedResult = results.find(r => r.scannerType === ScannerType.OUTDATED);
    const missingResult = results.find(r => r.scannerType === ScannerType.MISSING);

    expect(outdatedResult).toBeDefined();
    expect(missingResult).toBeDefined();

    // Verify missing scanner found the missing packages
    expect(missingResult!.issues).toHaveLength(2); // missing-package and missing-dev-package
    expect(missingResult!.issues.map(i => i.packageName).sort()).toEqual([
      'missing-dev-package',
      'missing-package'
    ]);

    // Verify all issues have proper structure
    [...outdatedResult!.issues, ...missingResult!.issues].forEach(issue => {
      expect(typeof issue.packageName).toBe('string');
      expect(typeof issue.description).toBe('string');
      expect(typeof issue.fixable).toBe('boolean');
      expect(issue.type).toBeDefined();
      expect(issue.severity).toBeDefined();
    });
  });

  test('Scanner registry handles individual scanner failures gracefully', async () => {
    const packageJson = {
      name: 'test-failure-handling',
      version: '1.0.0',
      dependencies: {
        'test-package': '^1.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);

    // Create a mock scanner that throws an error
    const failingScanner = {
      getScannerType: () => ScannerType.OUTDATED,
      scan: async () => {
        throw new Error('Simulated scanner failure');
      }
    };

    const workingScanner = new MissingScanner();

    registry.register(failingScanner as any);
    registry.register(workingScanner);

    // Run all scanners - should continue despite one failure
    const results = await registry.runAllScanners(context);

    // Should have one result from the working scanner
    expect(results).toHaveLength(1);
    expect(results[0].scannerType).toBe(ScannerType.MISSING);
  });

  test('Scanner registry can run specific scanner types', async () => {
    const packageJson = {
      name: 'test-specific-scanners',
      version: '1.0.0',
      dependencies: {
        'missing-package': '^1.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);

    registry.register(new OutdatedScanner());
    registry.register(new MissingScanner());

    // Run only the missing scanner
    const results = await registry.runScanners([ScannerType.MISSING], context);

    expect(results).toHaveLength(1);
    expect(results[0].scannerType).toBe(ScannerType.MISSING);
    expect(results[0].issues).toHaveLength(1);
    expect(results[0].issues[0].packageName).toBe('missing-package');
  });

  test('ScanContextFactory creates valid contexts', async () => {
    const packageJson = {
      name: 'test-context-creation',
      version: '1.0.0',
      dependencies: {
        'test-package': '^1.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson, PackageManagerType.YARN);

    // Verify context structure
    expect(context.projectPath).toBe(tempDir);
    expect(context.packageJson).toEqual(packageJson);
    expect(context.packageManager.getType()).toBe(PackageManagerType.YARN);
    expect(context.lockfile.type).toBe(PackageManagerType.YARN);
    expect(context.nodeModules.path).toBe(path.join(tempDir, 'node_modules'));
    expect(Array.isArray(context.nodeModules.packages)).toBe(true);

    // Verify context validation doesn't throw
    expect(() => {
      ScanContextFactory.validateContext(context);
    }).not.toThrow();
  });

  test('Core scanning infrastructure handles empty projects', async () => {
    const packageJson = {
      name: 'empty-project',
      version: '1.0.0'
      // No dependencies
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);

    registry.register(new OutdatedScanner());
    registry.register(new MissingScanner());

    const results = await registry.runAllScanners(context);

    // Should have results from both scanners but no issues
    expect(results).toHaveLength(2);
    results.forEach(result => {
      expect(result.issues).toHaveLength(0);
    });
  });
});