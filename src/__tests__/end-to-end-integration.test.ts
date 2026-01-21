/**
 * End-to-end integration tests for Depguardian CLI
 * Tests complete workflows from CLI commands through all components
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ScanCommand } from '../commands/ScanCommand';
import { ReportCommand } from '../commands/ReportCommand';
import { FixCommand } from '../commands/FixCommand';
import { DependencyAnalyzer } from '../core/DependencyAnalyzer';
import { CommandArgs, PackageManagerType } from '../core/types';
import { logger, LogLevel } from '../utils/Logger';

// Mock fetch to avoid network calls in tests
jest.mock('node-fetch');
const mockFetch = require('node-fetch') as jest.MockedFunction<typeof import('node-fetch').default>;

// Mock ora to avoid spinner issues in tests
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    text: ''
  }));
});

describe('End-to-End Integration Tests', () => {
  let tempDir: string;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-e2e-test-'));
    
    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    
    console.log = jest.fn((...args) => {
      consoleOutput.push(args.join(' '));
    });
    
    console.error = jest.fn((...args) => {
      consoleErrors.push(args.join(' '));
    });
    
    // Set logger to error level to reduce noise in tests
    logger.setLevel(LogLevel.ERROR);
    
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
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Complete CLI Workflow', () => {
    test('scan command works end-to-end with healthy project', async () => {
      // Create a healthy project
      const packageJson = {
        name: 'healthy-project',
        version: '1.0.0',
        dependencies: {
          'lodash': '^4.17.21'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);
      
      // Create node_modules with installed package
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'lodash');
      await fs.ensureDir(nodeModulesDir);
      await fs.writeJson(path.join(nodeModulesDir, 'package.json'), {
        name: 'lodash',
        version: '4.17.21'
      });

      const scanCommand = new ScanCommand();
      const args: CommandArgs = {
        projectPath: tempDir,
        options: { json: false, verbose: false }
      };

      const result = await scanCommand.execute(args);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      
      // Verify output contains expected elements
      const output = consoleOutput.join('\n');
      expect(output).toContain('DEPENDENCY SCAN RESULTS');
      expect(output).toContain('healthy-project');
      expect(output).toContain('Health Score:');
    });

    test('scan command works with JSON output', async () => {
      const packageJson = {
        name: 'json-test-project',
        version: '1.0.0',
        dependencies: {
          'missing-package': '^1.0.0'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

      const scanCommand = new ScanCommand();
      const args: CommandArgs = {
        projectPath: tempDir,
        options: { json: true, verbose: false }
      };

      const result = await scanCommand.execute(args);

      expect(result.success).toBe(true);
      
      // Verify JSON output
      const output = consoleOutput.join('\n');
      expect(() => JSON.parse(output)).not.toThrow();
      
      const parsedOutput = JSON.parse(output);
      expect(parsedOutput).toHaveProperty('healthScore');
      expect(parsedOutput).toHaveProperty('issues');
      expect(parsedOutput).toHaveProperty('projectInfo');
      expect(parsedOutput.projectInfo.name).toBe('json-test-project');
    });

    test('report command generates comprehensive reports', async () => {
      const packageJson = {
        name: 'report-test-project',
        version: '1.0.0',
        dependencies: {
          'missing-package': '^1.0.0',
          'another-missing': '^2.0.0'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

      const reportCommand = new ReportCommand();
      const args: CommandArgs = {
        projectPath: tempDir,
        options: { json: false, verbose: false }
      };

      const result = await reportCommand.execute(args);

      expect(result.success).toBe(true);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('DEPENDENCY HEALTH REPORT');
      expect(output).toContain('report-test-project');
    });

    test('fix command handles projects with no issues', async () => {
      const packageJson = {
        name: 'no-issues-project',
        version: '1.0.0'
        // No dependencies at all
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);
      
      // Create empty node_modules directory
      await fs.ensureDir(path.join(tempDir, 'node_modules'));

      const fixCommand = new FixCommand();
      const args: CommandArgs = {
        projectPath: tempDir,
        options: { json: false, verbose: false, yes: true }
      };

      const result = await fixCommand.execute(args);

      if (!result.success) {
        console.log('Fix command failed with output:', result.output);
        console.log('Console errors:', consoleErrors.join('\n'));
      }

      expect(result.success).toBe(true);
      
      const output = consoleOutput.join('\n');
      expect(output).toContain('Your project dependencies are healthy. No fixes needed.');
    });
  });

  describe('Error Handling Integration', () => {
    test('commands handle missing package.json gracefully', async () => {
      // Don't create package.json
      const scanCommand = new ScanCommand();
      const args: CommandArgs = {
        projectPath: tempDir,
        options: { json: false, verbose: false }
      };

      const result = await scanCommand.execute(args);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      
      const errors = consoleErrors.join('\n');
      expect(errors).toContain('package.json');
    });

    test('commands handle invalid JSON gracefully', async () => {
      // Create invalid package.json
      await fs.writeFile(path.join(tempDir, 'package.json'), '{ invalid json }');

      const scanCommand = new ScanCommand();
      const args: CommandArgs = {
        projectPath: tempDir,
        options: { json: false, verbose: false }
      };

      const result = await scanCommand.execute(args);

      expect(result.success).toBe(false);
      
      const errors = consoleErrors.join('\n');
      expect(errors).toContain('💡 Suggestions:');
    });

    test('verbose mode provides additional error details', async () => {
      const scanCommand = new ScanCommand();
      const args: CommandArgs = {
        projectPath: '/nonexistent/path',
        options: { json: false, verbose: true }
      };

      const result = await scanCommand.execute(args);

      expect(result.success).toBe(false);
      
      // Verbose mode should provide more detailed error information
      const errors = consoleErrors.join('\n');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Component Integration', () => {
    test('DependencyAnalyzer integrates with all scanners', async () => {
      const packageJson = {
        name: 'integration-test-project',
        version: '1.0.0',
        dependencies: {
          'installed-package': '^1.0.0',
          'missing-package': '^2.0.0'
        },
        devDependencies: {
          'missing-dev-package': '^3.0.0'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);
      
      // Create node_modules with only one package installed
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'installed-package');
      await fs.ensureDir(nodeModulesDir);
      await fs.writeJson(path.join(nodeModulesDir, 'package.json'), {
        name: 'installed-package',
        version: '1.0.0'
      });

      const analyzer = new DependencyAnalyzer();
      const analysis = await analyzer.analyze(tempDir);

      // Verify analysis results
      expect(analysis.healthScore).toBeGreaterThanOrEqual(0);
      expect(analysis.healthScore).toBeLessThanOrEqual(100);
      expect(analysis.projectInfo.name).toBe('integration-test-project');
      expect(analysis.issues.length).toBeGreaterThan(0);
      
      // Should detect missing packages
      const missingIssues = analysis.issues.filter(issue => issue.type === 'missing');
      expect(missingIssues.length).toBeGreaterThan(0);
    });

    test('Health reporter generates consistent reports', async () => {
      const packageJson = {
        name: 'reporter-test-project',
        version: '1.0.0',
        dependencies: {
          'test-package': '^1.0.0'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

      const analyzer = new DependencyAnalyzer();
      const analysis = await analyzer.analyze(tempDir);
      const report = await analyzer.generateReport(analysis);

      // Verify report structure
      expect(report).toHaveProperty('healthScore');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('recommendations');
      expect(typeof report.healthScore).toBe('number');
    });

    test('Suggestion engine provides actionable recommendations', async () => {
      const packageJson = {
        name: 'suggestions-test-project',
        version: '1.0.0',
        dependencies: {
          'missing-package': '^1.0.0'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

      const analyzer = new DependencyAnalyzer();
      const analysis = await analyzer.analyze(tempDir);
      const suggestions = await analyzer.suggestFixes(analysis);

      // Verify suggestions structure
      expect(Array.isArray(suggestions)).toBe(true);
      suggestions.forEach(suggestion => {
        expect(suggestion).toHaveProperty('description');
        expect(suggestion).toHaveProperty('risk');
        expect(suggestion).toHaveProperty('actions');
        expect(Array.isArray(suggestion.actions)).toBe(true);
      });
    });
  });

  describe('Package Manager Integration', () => {
    test('detects npm projects correctly', async () => {
      const packageJson = {
        name: 'npm-project',
        version: '1.0.0',
        dependencies: {
          'test-package': '^1.0.0'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);
      await fs.writeJson(path.join(tempDir, 'package-lock.json'), {
        name: 'npm-project',
        version: '1.0.0',
        lockfileVersion: 2
      });

      const analyzer = new DependencyAnalyzer();
      const analysis = await analyzer.analyze(tempDir);

      expect(analysis.packageManager).toBe(PackageManagerType.NPM);
    });

    test('detects yarn projects correctly', async () => {
      const packageJson = {
        name: 'yarn-project',
        version: '1.0.0',
        dependencies: {
          'test-package': '^1.0.0'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);
      await fs.writeFile(path.join(tempDir, 'yarn.lock'), '# Yarn lockfile v1\n');

      const analyzer = new DependencyAnalyzer();
      const analysis = await analyzer.analyze(tempDir);

      expect(analysis.packageManager).toBe(PackageManagerType.YARN);
    });

    test('detects pnpm projects correctly', async () => {
      const packageJson = {
        name: 'pnpm-project',
        version: '1.0.0',
        dependencies: {
          'test-package': '^1.0.0'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);
      await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n');

      const analyzer = new DependencyAnalyzer();
      const analysis = await analyzer.analyze(tempDir);

      expect(analysis.packageManager).toBe(PackageManagerType.PNPM);
    });
  });

  describe('Logging Integration', () => {
    test('verbose mode enables detailed logging', async () => {
      logger.setLevel(LogLevel.VERBOSE);
      
      const packageJson = {
        name: 'logging-test-project',
        version: '1.0.0',
        dependencies: {
          'test-package': '^1.0.0'
        }
      };

      await fs.writeJson(path.join(tempDir, 'package.json'), packageJson);

      const scanCommand = new ScanCommand();
      const args: CommandArgs = {
        projectPath: tempDir,
        options: { json: false, verbose: true }
      };

      await scanCommand.execute(args);

      // Verify that logging was active (logs should be captured)
      const recentLogs = logger.getRecentLogs(10);
      expect(recentLogs.length).toBeGreaterThan(0);
    });

    test('error logging captures failures properly', async () => {
      logger.setLevel(LogLevel.ERROR);
      
      const scanCommand = new ScanCommand();
      const args: CommandArgs = {
        projectPath: '/nonexistent/path',
        options: { json: false, verbose: false }
      };

      await scanCommand.execute(args);

      const errorLogs = logger.getLogsByLevel(LogLevel.ERROR);
      expect(errorLogs.length).toBeGreaterThan(0);
    });
  });
});