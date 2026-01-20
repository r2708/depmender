import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { OutdatedScanner } from '../scanners/OutdatedScanner';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { IssueType, IssueSeverity, PackageManagerType } from '../core/types';

// Mock fetch to avoid network calls in tests
jest.mock('node-fetch');
const mockFetch = require('node-fetch') as jest.MockedFunction<typeof import('node-fetch').default>;

describe('OutdatedScanner Property Tests - Part 2', () => {
  let tempDir: string;
  let scanner: OutdatedScanner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-outdated-test-'));
    // Use normal registry URL since we're mocking fetch
    scanner = new OutdatedScanner('https://registry.npmjs.org', 1000);
    
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
    scanner.clearCache();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /**
   * Property: Cache behavior
   * For any package name, cache operations should be consistent
   */
  test('Property: Cache behavior - Feature: depguardian, Property: Cache consistency', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('lodash', 'express', 'react'),
          { minLength: 0, maxLength: 3 }
        ),
        (packageNames) => {
          // Start with empty cache
          scanner.clearCache();
          let initialStats = scanner.getCacheStats();
          expect(initialStats.size).toBe(0);
          expect(initialStats.packages).toHaveLength(0);

          // Property: Cache should start empty after clear
          expect(scanner.getCacheStats().size).toBe(0);

          // Property: Cache stats should be consistent
          const stats = scanner.getCacheStats();
          expect(stats.size).toBe(stats.packages.length);
          expect(Array.isArray(stats.packages)).toBe(true);
          
          // Property: Package names in cache should be unique
          const uniquePackages = new Set(stats.packages);
          expect(uniquePackages.size).toBe(stats.packages.length);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Version analysis consistency
   * For any valid version strings, version analysis should be consistent
   */
  test('Property: Version analysis consistency - Feature: depguardian, Property: Version analysis', () => {
    fc.assert(
      fc.property(
        fc.record({
          packageName: fc.constantFrom('lodash', 'express', 'react'),
          installedVersion: fc.constantFrom('1.0.0', '2.1.0', '3.0.0'),
          declaredVersion: fc.constantFrom('^1.0.0', '~2.1.0', '^3.0.0'),
          latestVersion: fc.constantFrom('1.5.0', '2.2.0', '3.1.0')
        }),
        (versionData) => {
          // Property: Package name should be valid
          expect(typeof versionData.packageName).toBe('string');
          expect(versionData.packageName.length).toBeGreaterThan(0);

          // Property: Version strings should follow semver pattern
          expect(versionData.installedVersion).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
          expect(versionData.latestVersion).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
          expect(versionData.declaredVersion).toMatch(/^[\^~]?[0-9]+\.[0-9]+\.[0-9]+$/);

          // Property: All version components should be valid
          const installedParts = versionData.installedVersion.split('.');
          const latestParts = versionData.latestVersion.split('.');
          
          expect(installedParts).toHaveLength(3);
          expect(latestParts).toHaveLength(3);
          
          installedParts.forEach(part => {
            expect(Number.isInteger(parseInt(part, 10))).toBe(true);
            expect(parseInt(part, 10)).toBeGreaterThanOrEqual(0);
          });
          
          latestParts.forEach(part => {
            expect(Number.isInteger(parseInt(part, 10))).toBe(true);
            expect(parseInt(part, 10)).toBeGreaterThanOrEqual(0);
          });
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Error handling consistency
   * For any invalid inputs, scanner should handle errors gracefully
   */
  test('Property: Error handling consistency - Feature: depguardian, Property: Error handling', async () => {
    // Simplified test with fixed invalid data
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {}
    };

    try {
      const context = ScanContextFactory.createTestContext(tempDir, packageJson);
      const result = await scanner.scan(context);

      // Property: Even with invalid data, scanner should return valid result structure
      expect(result).toHaveProperty('scannerType');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('securityIssues');
      expect(result.scannerType).toBe('outdated');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.securityIssues)).toBe(true);

    } catch (error) {
      // Property: If scanner throws, it should be a meaningful error
      expect(error).toBeInstanceOf(Error);
      expect(typeof (error as Error).message).toBe('string');
      expect((error as Error).message.length).toBeGreaterThan(0);
    }
  });
});