import { ScanCommand } from '../commands/ScanCommand';
import { ReportCommand } from '../commands/ReportCommand';
import { FixCommand } from '../commands/FixCommand';
import { CommandArgs } from '../core/types';
import * as path from 'path';
import * as fs from 'fs-extra';

// Mock the dependencies
jest.mock('../core/DependencyAnalyzer');
jest.mock('../reporters/HealthReporter');
jest.mock('../fixers/AutoFixer');
jest.mock('../scanners/ScanContextFactory');
jest.mock('ora', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    text: ''
  }))
}));

describe('CLI Commands', () => {
  let testProjectPath: string;
  let mockArgs: CommandArgs;

  beforeEach(() => {
    testProjectPath = path.join(__dirname, 'test-project');
    mockArgs = {
      projectPath: testProjectPath,
      options: {
        json: false,
        verbose: false
      }
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('ScanCommand', () => {
    let scanCommand: ScanCommand;

    beforeEach(() => {
      scanCommand = new ScanCommand();
    });

    test('should have correct name and description', () => {
      expect(scanCommand.name).toBe('scan');
      expect(scanCommand.description).toBe('Analyze project dependencies and identify issues');
    });

    test('should execute scan successfully with mock data', async () => {
      // Mock DependencyAnalyzer
      const mockAnalysis = {
        healthScore: 85,
        issues: [
          {
            type: 'outdated',
            packageName: 'test-package',
            currentVersion: '1.0.0',
            latestVersion: '2.0.0',
            severity: 'medium',
            description: 'Package is outdated',
            fixable: true
          }
        ],
        packageManager: 'npm',
        projectInfo: {
          name: 'test-project',
          version: '1.0.0',
          path: testProjectPath,
          packageManager: 'npm'
        },
        securityVulnerabilities: []
      };

      const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
      DependencyAnalyzer.mockImplementation(() => ({
        analyze: jest.fn().mockResolvedValue(mockAnalysis)
      }));

      const result = await scanCommand.execute(mockArgs);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('DEPENDENCY SCAN RESULTS');
      expect(result.output).toContain('test-project');
      expect(result.output).toContain('Health Score:');
      expect(result.output).toContain('85/100');
      expect(result.output).toContain('Good');
    });

    test('should handle JSON output format', async () => {
      const mockAnalysis = {
        healthScore: 90,
        issues: [],
        packageManager: 'npm',
        projectInfo: {
          name: 'test-project',
          version: '1.0.0',
          path: testProjectPath,
          packageManager: 'npm'
        },
        securityVulnerabilities: []
      };

      const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
      DependencyAnalyzer.mockImplementation(() => ({
        analyze: jest.fn().mockResolvedValue(mockAnalysis)
      }));

      const jsonArgs = { ...mockArgs, options: { ...mockArgs.options, json: true } };
      const result = await scanCommand.execute(jsonArgs);

      expect(result.success).toBe(true);
      expect(() => JSON.parse(result.output)).not.toThrow();
    });

    test('should handle analysis errors gracefully', async () => {
      const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
      DependencyAnalyzer.mockImplementation(() => ({
        analyze: jest.fn().mockRejectedValue(new Error('Analysis failed'))
      }));

      const result = await scanCommand.execute(mockArgs);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Analysis failed');
    });
  });

  describe('ReportCommand', () => {
    let reportCommand: ReportCommand;

    beforeEach(() => {
      reportCommand = new ReportCommand();
    });

    test('should have correct name and description', () => {
      expect(reportCommand.name).toBe('report');
      expect(reportCommand.description).toBe('Generate detailed dependency health report');
    });

    test('should execute report successfully', async () => {
      const mockAnalysis = {
        healthScore: 75,
        issues: [],
        packageManager: 'npm',
        projectInfo: {
          name: 'test-project',
          version: '1.0.0',
          path: testProjectPath,
          packageManager: 'npm'
        },
        securityVulnerabilities: []
      };

      const mockReport = {
        healthScore: 75,
        summary: {
          totalPackages: 10,
          issuesFound: 0,
          criticalIssues: 0,
          securityVulnerabilities: 0,
          healthScore: 75
        },
        outdatedPackages: [],
        securityIssues: [],
        peerConflicts: [],
        recommendations: []
      };

      const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
      const { HealthReporter } = require('../reporters/HealthReporter');
      
      DependencyAnalyzer.mockImplementation(() => ({
        analyze: jest.fn().mockResolvedValue(mockAnalysis)
      }));

      HealthReporter.mockImplementation(() => ({
        generateReport: jest.fn().mockResolvedValue(mockReport),
        formatForCLI: jest.fn().mockReturnValue('Mock CLI Report'),
        formatForJSON: jest.fn().mockReturnValue(JSON.stringify(mockReport))
      }));

      const result = await reportCommand.execute(mockArgs);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('Mock CLI Report');
    });

    test('should handle JSON output format', async () => {
      const mockAnalysis = {
        healthScore: 75,
        issues: [],
        packageManager: 'npm',
        projectInfo: {
          name: 'test-project',
          version: '1.0.0',
          path: testProjectPath,
          packageManager: 'npm'
        },
        securityVulnerabilities: []
      };

      const mockReport = {
        healthScore: 75,
        summary: {
          totalPackages: 10,
          issuesFound: 0,
          criticalIssues: 0,
          securityVulnerabilities: 0,
          healthScore: 75
        },
        outdatedPackages: [],
        securityIssues: [],
        peerConflicts: [],
        recommendations: []
      };

      const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
      const { HealthReporter } = require('../reporters/HealthReporter');
      
      DependencyAnalyzer.mockImplementation(() => ({
        analyze: jest.fn().mockResolvedValue(mockAnalysis)
      }));

      HealthReporter.mockImplementation(() => ({
        generateReport: jest.fn().mockResolvedValue(mockReport),
        formatForJSON: jest.fn().mockReturnValue(JSON.stringify(mockReport))
      }));

      const jsonArgs = { ...mockArgs, options: { ...mockArgs.options, json: true } };
      const result = await reportCommand.execute(jsonArgs);

      expect(result.success).toBe(true);
      expect(() => JSON.parse(result.output)).not.toThrow();
    });
  });

  describe('FixCommand', () => {
    let fixCommand: FixCommand;

    beforeEach(() => {
      fixCommand = new FixCommand();
    });

    test('should have correct name and description', () => {
      expect(fixCommand.name).toBe('fix');
      expect(fixCommand.description).toBe('Automatically fix detected dependency issues');
    });

    test('should handle no issues to fix', async () => {
      const mockAnalysis = {
        healthScore: 100,
        issues: [],
        packageManager: 'npm',
        projectInfo: {
          name: 'test-project',
          version: '1.0.0',
          path: testProjectPath,
          packageManager: 'npm'
        },
        securityVulnerabilities: []
      };

      const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
      DependencyAnalyzer.mockImplementation(() => ({
        analyze: jest.fn().mockResolvedValue(mockAnalysis)
      }));

      const result = await fixCommand.execute(mockArgs);

      expect(result.success).toBe(true);
      expect(result.output).toContain('No fixes needed');
    });

    test('should handle successful fix application', async () => {
      const mockAnalysis = {
        healthScore: 60,
        issues: [
          {
            type: 'missing',
            packageName: 'missing-package',
            severity: 'high',
            description: 'Package is missing',
            fixable: true
          }
        ],
        packageManager: 'npm',
        projectInfo: {
          name: 'test-project',
          version: '1.0.0',
          path: testProjectPath,
          packageManager: 'npm'
        },
        securityVulnerabilities: []
      };

      const mockFixSuggestions = [
        {
          type: 'install-missing',
          description: 'Install missing package',
          risk: 'low',
          actions: [
            {
              type: 'install',
              packageName: 'missing-package'
            }
          ],
          estimatedImpact: 'Low risk'
        }
      ];

      const mockFixResult = {
        success: true,
        appliedFixes: mockFixSuggestions,
        errors: [],
        backup: {
          originalPath: path.join(testProjectPath, 'package.json'),
          backupPath: path.join(testProjectPath, 'package.json.backup'),
          timestamp: new Date()
        }
      };

      const mockContext = {
        packageManager: {
          getType: jest.fn().mockReturnValue('npm')
        }
      };

      const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
      const { AutoFixer } = require('../fixers/AutoFixer');
      const { ScanContextFactory } = require('../scanners/ScanContextFactory');

      DependencyAnalyzer.mockImplementation(() => ({
        analyze: jest.fn().mockResolvedValue(mockAnalysis),
        suggestFixes: jest.fn().mockResolvedValue(mockFixSuggestions)
      }));

      AutoFixer.mockImplementation(() => ({
        applyFixes: jest.fn().mockResolvedValue(mockFixResult)
      }));

      ScanContextFactory.createContext = jest.fn().mockResolvedValue(mockContext);

      // Use --yes flag to skip confirmation
      const yesArgs = { ...mockArgs, options: { ...mockArgs.options, yes: true } };
      const result = await fixCommand.execute(yesArgs);

      expect(result.success).toBe(true);
      expect(result.output).toContain('FIXES APPLIED SUCCESSFULLY');
    });

    test('should handle fix errors gracefully', async () => {
      const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
      DependencyAnalyzer.mockImplementation(() => ({
        analyze: jest.fn().mockRejectedValue(new Error('Fix failed'))
      }));

      const result = await fixCommand.execute(mockArgs);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Fix failed');
    });
  });
});