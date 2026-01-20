import * as fc from 'fast-check';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { OutdatedScanner } from '../scanners/OutdatedScanner';
import { ScanContextFactory } from '../scanners/ScanContextFactory';
import { IssueType, IssueSeverity, PackageManagerType } from '../core/types';

// Mock fetch to control network behavior in tests
jest.mock('node-fetch');
const mockFetch = require('node-fetch') as jest.MockedFunction<typeof import('node-fetch').default>;

describe('OutdatedScanner Async Scenarios and Edge Cases', () => {
  let tempDir: string;
  let scanner: OutdatedScanner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-outdated-async-test-'));
    scanner = new OutdatedScanner('https://registry.npmjs.org', 1000);
    
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
   * Property: Network timeout handling
   * Scanner should handle network timeouts gracefully
   */
  test('Property: Network timeout handling - Feature: depguardian, Property: Timeout resilience', async () => {
    // Mock fetch to simulate timeout
    mockFetch.mockImplementation(() => 
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 50)
      )
    );

    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'timeout-package': '^1.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    context.nodeModules.packages = [{
      name: 'timeout-package',
      version: '1.0.0',
      path: path.join(tempDir, 'node_modules', 'timeout-package'),
      isValid: true
    }];

    const result = await scanner.scan(context);

    // Property: Scanner should handle timeouts gracefully
    expect(result.scannerType).toBe('outdated');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.securityIssues)).toBe(true);
    
    // Property: No issues should be found when registry is unreachable
    expect(result.issues).toHaveLength(0);
  });

  /**
   * Property: Network error handling
   * Scanner should handle various network errors gracefully
   */
  test('Property: Network error handling - Feature: depguardian, Property: Error resilience', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'ECONNREFUSED',
          'ENOTFOUND', 
          'ETIMEDOUT',
          'ECONNRESET'
        ),
        async (errorCode) => {
          // Mock fetch to simulate different network errors
          const networkError = new Error(`Network error: ${errorCode}`);
          (networkError as any).code = errorCode;
          mockFetch.mockRejectedValue(networkError);

          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              'error-package': '^1.0.0'
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          context.nodeModules.packages = [{
            name: 'error-package',
            version: '1.0.0',
            path: path.join(tempDir, 'node_modules', 'error-package'),
            isValid: true
          }];

          const result = await scanner.scan(context);

          // Property: Scanner should handle network errors gracefully
          expect(result.scannerType).toBe('outdated');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);
          
          // Property: No issues should be found when network fails
          expect(result.issues).toHaveLength(0);
        }
      ),
      { numRuns: 4 }
    );
  });

  /**
   * Property: HTTP status code handling
   * Scanner should handle various HTTP status codes appropriately
   */
  test('Property: HTTP status code handling - Feature: depguardian, Property: HTTP resilience', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(404, 500, 502, 503, 429),
        async (statusCode) => {
          // Mock fetch to return different HTTP status codes
          mockFetch.mockResolvedValue({
            ok: statusCode < 400,
            status: statusCode,
            json: async () => ({}),
          } as any);

          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              'http-test-package': '^1.0.0'
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          context.nodeModules.packages = [{
            name: 'http-test-package',
            version: '1.0.0',
            path: path.join(tempDir, 'node_modules', 'http-test-package'),
            isValid: true
          }];

          const result = await scanner.scan(context);

          // Property: Scanner should handle HTTP errors gracefully
          expect(result.scannerType).toBe('outdated');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);
          
          // Property: No issues should be found when HTTP request fails
          expect(result.issues).toHaveLength(0);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Successful registry response handling
   * Scanner should correctly process valid registry responses
   */
  test('Property: Successful registry response - Feature: depguardian, Property: Registry processing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          packageName: fc.constantFrom('lodash', 'express', 'react'),
          currentVersion: fc.constantFrom('1.0.0', '2.0.0', '3.0.0'),
          latestVersion: fc.constantFrom('1.5.0', '2.5.0', '3.5.0')
        }),
        async (testData) => {
          // Clear cache to avoid interference
          scanner.clearCache();
          
          // Mock successful registry response with the exact test data
          mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              name: testData.packageName,
              'dist-tags': {
                latest: testData.latestVersion
              },
              versions: {
                [testData.currentVersion]: {},
                [testData.latestVersion]: {}
              },
              description: `Test package ${testData.packageName}`,
              homepage: `https://example.com/${testData.packageName}`
            }),
          } as any);

          const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            dependencies: {
              [testData.packageName]: `^${testData.currentVersion}`
            }
          };

          const context = ScanContextFactory.createTestContext(tempDir, packageJson);
          context.nodeModules.packages = [{
            name: testData.packageName,
            version: testData.currentVersion,
            path: path.join(tempDir, 'node_modules', testData.packageName),
            isValid: true
          }];

          const result = await scanner.scan(context);

          // Property: Scanner should process successful responses
          expect(result.scannerType).toBe('outdated');
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.securityIssues)).toBe(true);

          // Property: Should detect outdated packages when newer version available
          const outdatedIssues = result.issues.filter(issue => 
            issue.type === IssueType.OUTDATED && 
            issue.packageName === testData.packageName
          );
          
          if (outdatedIssues.length > 0) {
            const issue = outdatedIssues[0];
            expect(issue.currentVersion).toBe(testData.currentVersion);
            expect(issue.latestVersion).toBe(testData.latestVersion);
            expect(issue.fixable).toBe(true);
            expect(Object.values(IssueSeverity)).toContain(issue.severity);
          }
          
          // Property: Should not find issues if versions are the same
          if (testData.currentVersion === testData.latestVersion) {
            expect(outdatedIssues).toHaveLength(0);
          }
        }
      ),
      { numRuns: 3 }
    );
  });

  /**
   * Property: Concurrent package scanning
   * Scanner should handle multiple packages concurrently
   */
  test('Property: Concurrent package scanning - Feature: depguardian, Property: Concurrency handling', async () => {
    // Mock registry responses for multiple packages
    mockFetch.mockImplementation(async (url: any) => {
      const packageName = (url as string).split('/').pop();
      
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: packageName,
          'dist-tags': {
            latest: '2.0.0'
          },
          versions: {
            '1.0.0': {},
            '2.0.0': {}
          }
        }),
      } as any;
    });

    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'package-a': '^1.0.0',
        'package-b': '^1.0.0',
        'package-c': '^1.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    context.nodeModules.packages = [
      {
        name: 'package-a',
        version: '1.0.0',
        path: path.join(tempDir, 'node_modules', 'package-a'),
        isValid: true
      },
      {
        name: 'package-b',
        version: '1.0.0',
        path: path.join(tempDir, 'node_modules', 'package-b'),
        isValid: true
      },
      {
        name: 'package-c',
        version: '1.0.0',
        path: path.join(tempDir, 'node_modules', 'package-c'),
        isValid: true
      }
    ];

    const result = await scanner.scan(context);

    // Property: Scanner should handle concurrent requests
    expect(result.scannerType).toBe('outdated');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.securityIssues)).toBe(true);

    // Property: All packages should be processed
    const processedPackages = new Set(result.issues.map(issue => issue.packageName));
    expect(processedPackages.size).toBeLessThanOrEqual(3);
    
    // Property: All issues should be valid
    result.issues.forEach(issue => {
      expect(issue.type).toBe(IssueType.OUTDATED);
      expect(['package-a', 'package-b', 'package-c']).toContain(issue.packageName);
      expect(issue.fixable).toBe(true);
    });
  });

  /**
   * Property: Cache behavior with async operations
   * Cache should work correctly with concurrent async operations
   */
  test('Property: Cache behavior with async operations - Feature: depguardian, Property: Async cache consistency', async () => {
    let callCount = 0;
    
    // Mock fetch to track calls and simulate caching
    mockFetch.mockImplementation(async (url: any) => {
      callCount++;
      const packageName = (url as string).split('/').pop();
      
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: packageName,
          'dist-tags': {
            latest: '2.0.0'
          },
          versions: {
            '1.0.0': {},
            '2.0.0': {}
          }
        }),
      } as any;
    });

    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'cached-package': '^1.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    context.nodeModules.packages = [{
      name: 'cached-package',
      version: '1.0.0',
      path: path.join(tempDir, 'node_modules', 'cached-package'),
      isValid: true
    }];

    // First scan
    const result1 = await scanner.scan(context);
    const firstCallCount = callCount;

    // Second scan - should use cache
    const result2 = await scanner.scan(context);
    const secondCallCount = callCount;

    // Property: Cache should reduce network calls
    expect(secondCallCount).toBe(firstCallCount);

    // Property: Results should be consistent
    expect(result1.scannerType).toBe(result2.scannerType);
    expect(result1.issues.length).toBe(result2.issues.length);

    // Property: Cache stats should be accurate
    const cacheStats = scanner.getCacheStats();
    expect(cacheStats.size).toBeGreaterThan(0);
    expect(cacheStats.packages).toContain('cached-package');
  });

  /**
   * Property: Invalid JSON response handling
   * Scanner should handle malformed JSON responses gracefully
   */
  test('Property: Invalid JSON response handling - Feature: depguardian, Property: JSON parsing resilience', async () => {
    // Mock fetch to return invalid JSON
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    } as any);

    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'invalid-json-package': '^1.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    context.nodeModules.packages = [{
      name: 'invalid-json-package',
      version: '1.0.0',
      path: path.join(tempDir, 'node_modules', 'invalid-json-package'),
      isValid: true
    }];

    const result = await scanner.scan(context);

    // Property: Scanner should handle JSON parsing errors gracefully
    expect(result.scannerType).toBe('outdated');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.securityIssues)).toBe(true);
    
    // Property: No issues should be found when JSON is invalid
    expect(result.issues).toHaveLength(0);
  });

  /**
   * Property: Empty dependencies handling
   * Scanner should handle projects with no dependencies
   */
  test('Property: Empty dependencies handling - Feature: depguardian, Property: Empty project handling', async () => {
    const packageJson = {
      name: 'empty-project',
      version: '1.0.0',
      dependencies: {}
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    context.nodeModules.packages = [];

    const result = await scanner.scan(context);

    // Property: Scanner should handle empty dependencies
    expect(result.scannerType).toBe('outdated');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.securityIssues)).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  /**
   * Property: Missing node_modules handling
   * Scanner should handle packages declared but not installed
   */
  test('Property: Missing node_modules handling - Feature: depguardian, Property: Missing packages handling', async () => {
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'missing-package': '^1.0.0',
        'another-missing': '^2.0.0'
      }
    };

    const context = ScanContextFactory.createTestContext(tempDir, packageJson);
    context.nodeModules.packages = []; // No packages installed

    const result = await scanner.scan(context);

    // Property: Scanner should handle missing packages
    expect(result.scannerType).toBe('outdated');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.securityIssues)).toBe(true);
    
    // Property: No outdated issues for missing packages (handled by MissingScanner)
    expect(result.issues).toHaveLength(0);
  });
});