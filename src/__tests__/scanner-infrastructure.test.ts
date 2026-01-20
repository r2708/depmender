import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { BaseDependencyScanner, ScannerRegistry, ScanContextFactory } from '../scanners';
import { 
  ScanContext, 
  ScanResult, 
  ScannerType, 
  PackageManagerType,
  DependencyIssue,
  IssueSeverity,
  IssueType
} from '../core/types';

// Mock scanner for testing
class MockScanner extends BaseDependencyScanner {
  constructor(private scannerType: ScannerType) {
    super();
  }

  getScannerType(): ScannerType {
    return this.scannerType;
  }

  async scan(context: ScanContext): Promise<ScanResult> {
    this.validateContext(context);
    
    const result = this.createBaseScanResult();
    
    // Add a mock issue for testing
    const mockIssue: DependencyIssue = {
      type: IssueType.OUTDATED,
      packageName: 'test-package',
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      severity: IssueSeverity.MEDIUM,
      description: 'Mock issue for testing',
      fixable: true
    };
    
    result.issues.push(mockIssue);
    return result;
  }
}

describe('Scanner Infrastructure', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-scanner-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('BaseDependencyScanner', () => {
    let mockScanner: MockScanner;
    let mockContext: ScanContext;

    beforeEach(() => {
      mockScanner = new MockScanner(ScannerType.OUTDATED);
      mockContext = ScanContextFactory.createTestContext(
        tempDir,
        {
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'lodash': '^4.17.21',
            'express': '^4.18.0'
          },
          devDependencies: {
            'typescript': '^5.0.0'
          },
          peerDependencies: {
            'react': '^18.0.0'
          },
          optionalDependencies: {
            'fsevents': '^2.3.0'
          }
        }
      );
    });

    test('should validate context correctly', () => {
      expect(() => mockScanner['validateContext'](mockContext)).not.toThrow();
    });

    test('should throw error for invalid context', () => {
      const invalidContext = { ...mockContext, projectPath: '' };
      expect(() => mockScanner['validateContext'](invalidContext)).toThrow('Project path is required');
    });

    test('should create base scan result', () => {
      const result = mockScanner['createBaseScanResult']();
      expect(result.scannerType).toBe(ScannerType.OUTDATED);
      expect(result.issues).toEqual([]);
      expect(result.securityIssues).toEqual([]);
    });

    test('should identify dependency types correctly', () => {
      expect(mockScanner['isDevDependency']('typescript', mockContext)).toBe(true);
      expect(mockScanner['isDevDependency']('lodash', mockContext)).toBe(false);
      
      expect(mockScanner['isPeerDependency']('react', mockContext)).toBe(true);
      expect(mockScanner['isPeerDependency']('lodash', mockContext)).toBe(false);
      
      expect(mockScanner['isOptionalDependency']('fsevents', mockContext)).toBe(true);
      expect(mockScanner['isOptionalDependency']('lodash', mockContext)).toBe(false);
    });

    test('should get declared versions correctly', () => {
      expect(mockScanner['getDeclaredVersion']('lodash', mockContext)).toBe('^4.17.21');
      expect(mockScanner['getDeclaredVersion']('typescript', mockContext)).toBe('^5.0.0');
      expect(mockScanner['getDeclaredVersion']('react', mockContext)).toBe('^18.0.0');
      expect(mockScanner['getDeclaredVersion']('nonexistent', mockContext)).toBeUndefined();
    });

    test('should get all declared dependencies', () => {
      const allDeps = mockScanner['getAllDeclaredDependencies'](mockContext);
      expect(allDeps).toEqual({
        'lodash': '^4.17.21',
        'express': '^4.18.0',
        'typescript': '^5.0.0',
        'react': '^18.0.0',
        'fsevents': '^2.3.0'
      });
    });

    test('should handle installed packages', () => {
      // Add mock installed packages
      mockContext.nodeModules.packages = [
        {
          name: 'lodash',
          version: '4.17.21',
          path: path.join(tempDir, 'node_modules', 'lodash'),
          isValid: true
        },
        {
          name: 'broken-package',
          version: 'unknown',
          path: path.join(tempDir, 'node_modules', 'broken-package'),
          isValid: false
        }
      ];

      expect(mockScanner['isPackageInstalled']('lodash', mockContext)).toBe(true);
      expect(mockScanner['isPackageInstalled']('nonexistent', mockContext)).toBe(false);
      
      expect(mockScanner['getInstalledVersion']('lodash', mockContext)).toBe('4.17.21');
      expect(mockScanner['getInstalledVersion']('nonexistent', mockContext)).toBeUndefined();
      
      expect(mockScanner['isInstalledPackageValid']('lodash', mockContext)).toBe(true);
      expect(mockScanner['isInstalledPackageValid']('broken-package', mockContext)).toBe(false);
    });

    test('should scan successfully', async () => {
      const result = await mockScanner.scan(mockContext);
      
      expect(result.scannerType).toBe(ScannerType.OUTDATED);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].packageName).toBe('test-package');
      expect(result.issues[0].type).toBe(IssueType.OUTDATED);
    });
  });

  describe('ScannerRegistry', () => {
    let registry: ScannerRegistry;
    let mockScanner1: MockScanner;
    let mockScanner2: MockScanner;

    beforeEach(() => {
      registry = new ScannerRegistry();
      mockScanner1 = new MockScanner(ScannerType.OUTDATED);
      mockScanner2 = new MockScanner(ScannerType.MISSING);
    });

    test('should register scanners', () => {
      registry.register(mockScanner1);
      expect(registry.isRegistered(ScannerType.OUTDATED)).toBe(true);
      expect(registry.getCount()).toBe(1);
    });

    test('should not allow duplicate scanner registration', () => {
      registry.register(mockScanner1);
      const duplicateScanner = new MockScanner(ScannerType.OUTDATED);
      
      expect(() => registry.register(duplicateScanner)).toThrow(
        'Scanner of type outdated is already registered'
      );
    });

    test('should unregister scanners', () => {
      registry.register(mockScanner1);
      expect(registry.unregister(ScannerType.OUTDATED)).toBe(true);
      expect(registry.isRegistered(ScannerType.OUTDATED)).toBe(false);
      expect(registry.unregister(ScannerType.OUTDATED)).toBe(false);
    });

    test('should get scanners by type', () => {
      registry.register(mockScanner1);
      const retrieved = registry.getScanner(ScannerType.OUTDATED);
      expect(retrieved).toBe(mockScanner1);
      expect(registry.getScanner(ScannerType.MISSING)).toBeUndefined();
    });

    test('should get all scanners and types', () => {
      registry.register(mockScanner1);
      registry.register(mockScanner2);
      
      const types = registry.getRegisteredTypes();
      expect(types).toContain(ScannerType.OUTDATED);
      expect(types).toContain(ScannerType.MISSING);
      expect(types).toHaveLength(2);
      
      const scanners = registry.getAllScanners();
      expect(scanners).toContain(mockScanner1);
      expect(scanners).toContain(mockScanner2);
      expect(scanners).toHaveLength(2);
    });

    test('should run specific scanner', async () => {
      registry.register(mockScanner1);
      const mockContext = ScanContextFactory.createTestContext(tempDir, {
        name: 'test',
        version: '1.0.0'
      });
      
      const result = await registry.runScanner(ScannerType.OUTDATED, mockContext);
      expect(result.scannerType).toBe(ScannerType.OUTDATED);
      expect(result.issues).toHaveLength(1);
    });

    test('should throw error for unregistered scanner', async () => {
      const mockContext = ScanContextFactory.createTestContext(tempDir, {
        name: 'test',
        version: '1.0.0'
      });
      
      await expect(registry.runScanner(ScannerType.OUTDATED, mockContext))
        .rejects.toThrow('Scanner of type outdated is not registered');
    });

    test('should run all scanners', async () => {
      registry.register(mockScanner1);
      registry.register(mockScanner2);
      
      const mockContext = ScanContextFactory.createTestContext(tempDir, {
        name: 'test',
        version: '1.0.0'
      });
      
      const results = await registry.runAllScanners(mockContext);
      expect(results).toHaveLength(2);
      expect(results[0].scannerType).toBe(ScannerType.OUTDATED);
      expect(results[1].scannerType).toBe(ScannerType.MISSING);
    });

    test('should run specific scanners', async () => {
      registry.register(mockScanner1);
      registry.register(mockScanner2);
      
      const mockContext = ScanContextFactory.createTestContext(tempDir, {
        name: 'test',
        version: '1.0.0'
      });
      
      const results = await registry.runScanners([ScannerType.OUTDATED], mockContext);
      expect(results).toHaveLength(1);
      expect(results[0].scannerType).toBe(ScannerType.OUTDATED);
    });

    test('should clear all scanners', () => {
      registry.register(mockScanner1);
      registry.register(mockScanner2);
      expect(registry.getCount()).toBe(2);
      
      registry.clear();
      expect(registry.getCount()).toBe(0);
      expect(registry.getRegisteredTypes()).toHaveLength(0);
    });

    test('should create default registry', () => {
      const defaultRegistry = ScannerRegistry.createDefault();
      expect(defaultRegistry).toBeInstanceOf(ScannerRegistry);
      // Default registry starts empty until scanners are implemented
      expect(defaultRegistry.getCount()).toBe(0);
    });
  });

  describe('ScanContextFactory', () => {
    beforeEach(async () => {
      // Create a mock project structure
      await fs.writeJson(path.join(tempDir, 'package.json'), {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'lodash': '^4.17.21'
        }
      });
      
      // Create package-lock.json for npm detection
      await fs.writeJson(path.join(tempDir, 'package-lock.json'), {
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 2
      });
      
      // Create node_modules structure
      const nodeModulesPath = path.join(tempDir, 'node_modules', 'lodash');
      await fs.ensureDir(nodeModulesPath);
      await fs.writeJson(path.join(nodeModulesPath, 'package.json'), {
        name: 'lodash',
        version: '4.17.21'
      });
    });

    test('should create complete scan context', async () => {
      const context = await ScanContextFactory.createContext(tempDir);
      
      expect(context.projectPath).toBe(tempDir);
      expect(context.packageJson.name).toBe('test-project');
      expect(context.packageManager.getType()).toBe(PackageManagerType.NPM);
      expect(context.lockfile.type).toBe(PackageManagerType.NPM);
      expect(context.nodeModules.packages).toHaveLength(1);
      expect(context.nodeModules.packages[0].name).toBe('lodash');
    });

    test('should create context with custom package manager', async () => {
      const context = await ScanContextFactory.createContextWithPackageManager(
        tempDir, 
        PackageManagerType.YARN
      );
      
      expect(context.packageManager.getType()).toBe(PackageManagerType.YARN);
    });

    test('should throw error for non-existent project', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent');
      
      await expect(ScanContextFactory.createContext(nonExistentPath))
        .rejects.toThrow('Project path does not exist');
    });

    test('should throw error for missing package.json', async () => {
      const emptyDir = path.join(tempDir, 'empty');
      await fs.ensureDir(emptyDir);
      
      await expect(ScanContextFactory.createContext(emptyDir))
        .rejects.toThrow('package.json not found');
    });

    test('should create test context', () => {
      const packageJson = {
        name: 'test-project',
        version: '1.0.0'
      };
      
      const context = ScanContextFactory.createTestContext(tempDir, packageJson);
      
      expect(context.projectPath).toBe(tempDir);
      expect(context.packageJson).toBe(packageJson);
      expect(context.packageManager.getType()).toBe(PackageManagerType.NPM);
      expect(context.lockfile.type).toBe(PackageManagerType.NPM);
      expect(context.nodeModules.packages).toHaveLength(0);
    });

    test('should validate context', () => {
      const validContext = ScanContextFactory.createTestContext(tempDir, {
        name: 'test',
        version: '1.0.0'
      });
      
      expect(() => ScanContextFactory.validateContext(validContext)).not.toThrow();
      
      const invalidContext = { ...validContext, projectPath: '' };
      expect(() => ScanContextFactory.validateContext(invalidContext))
        .toThrow('Project path is required');
    });
  });
});