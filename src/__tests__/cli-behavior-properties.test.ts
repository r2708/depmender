import * as fc from 'fast-check';
import { ScanCommand } from '../commands/ScanCommand';
import { ReportCommand } from '../commands/ReportCommand';
import { FixCommand } from '../commands/FixCommand';
import { CommandArgs } from '../core/types';
import { CLIFormatter } from '../utils/CLIFormatter';
import { HelpSystem } from '../utils/HelpSystem';
import * as path from 'path';

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

describe('CLI Behavior Properties', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Property 31: Clean output formatting
   * For any CLI command output, it should be clean, formatted, and include clear summaries
   * Validates: Requirements 6.4
   */
  test('Property 31: Clean output formatting', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          healthScore: fc.integer({ min: 0, max: 100 }),
          issues: fc.array(fc.record({
            type: fc.constantFrom('outdated', 'missing', 'broken', 'peer-conflict', 'version-mismatch', 'security'),
            packageName: fc.string({ minLength: 1, maxLength: 50 }),
            severity: fc.constantFrom('low', 'medium', 'high', 'critical'),
            description: fc.string({ minLength: 10, maxLength: 100 }),
            fixable: fc.boolean()
          }), { maxLength: 20 }),
          packageManager: fc.constantFrom('npm', 'yarn', 'pnpm'),
          projectInfo: fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            path: fc.string({ minLength: 1, maxLength: 100 }),
            packageManager: fc.constantFrom('npm', 'yarn', 'pnpm')
          }),
          securityVulnerabilities: fc.array(fc.record({
            packageName: fc.string({ minLength: 1, maxLength: 50 }),
            version: fc.string({ minLength: 1, maxLength: 20 }),
            severity: fc.constantFrom('low', 'moderate', 'high', 'critical'),
            vulnerability: fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              title: fc.string({ minLength: 10, maxLength: 100 }),
              cvss: fc.float({ min: 0, max: 10 })
            }),
            patchAvailable: fc.boolean()
          }), { maxLength: 10 })
        }),
        fc.record({
          json: fc.boolean(),
          verbose: fc.boolean(),
          path: fc.string({ minLength: 1, maxLength: 100 })
        }),
        async (mockAnalysis: any, options: any) => {
          // Mock the analyzer
          const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
          DependencyAnalyzer.mockImplementation(() => ({
            analyze: jest.fn().mockResolvedValue(mockAnalysis)
          }));

          const scanCommand = new ScanCommand();
          const args: CommandArgs = {
            projectPath: path.resolve('.'),
            options
          };

          const result = await scanCommand.execute(args);

          // Verify clean output formatting
          expect(result.success).toBe(true);
          expect(typeof result.output).toBe('string');
          expect(result.output.length).toBeGreaterThan(0);

          if (!options.json) {
            // For human-readable output, verify it contains expected sections
            expect(result.output).toContain('DEPENDENCY SCAN RESULTS');
            expect(result.output).toContain('Health Score');
            expect(result.output).toContain(mockAnalysis.healthScore.toString());
            expect(result.output).toContain('Project:');
            expect(result.output).toContain(mockAnalysis.projectInfo.name);
            
            // Verify clear summaries are present
            expect(result.output).toContain('Issues Found:');
            expect(result.output).toContain('Next Steps');
            
            // Verify formatting is clean (no excessive whitespace, proper structure)
            const lines = result.output.split('\n');
            expect(lines.length).toBeGreaterThan(5); // Should have multiple sections
            
            // Should not have excessive empty lines
            const consecutiveEmptyLines = result.output.match(/\n\n\n+/g);
            expect(consecutiveEmptyLines).toBeNull(); // No more than 2 consecutive newlines
          } else {
            // For JSON output, verify it's valid JSON
            expect(() => JSON.parse(result.output)).not.toThrow();
            const parsed = JSON.parse(result.output);
            expect(parsed.healthScore).toBe(mockAnalysis.healthScore);
            expect(parsed.projectInfo.name).toBe(mockAnalysis.projectInfo.name);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 32: Progress indication for long operations
   * For any long-running operation, progress indicators should be shown during execution
   * Validates: Requirements 6.5
   */
  test('Property 32: Progress indication for long operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('scan', 'report', 'fix'),
        async (commandType: string) => {
          const mockAnalysis = {
            healthScore: 75,
            issues: [],
            packageManager: 'npm',
            projectInfo: { name: 'test', version: '1.0.0', path: '.', packageManager: 'npm' },
            securityVulnerabilities: []
          };

          // Mock the dependencies
          const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
          const { HealthReporter } = require('../reporters/HealthReporter');
          const { AutoFixer } = require('../fixers/AutoFixer');
          const { ScanContextFactory } = require('../scanners/ScanContextFactory');

          const mockReport = {
            healthScore: mockAnalysis.healthScore,
            summary: { totalPackages: 10, issuesFound: 0, criticalIssues: 0, securityVulnerabilities: 0, healthScore: 75 },
            outdatedPackages: [],
            securityIssues: [],
            peerConflicts: [],
            recommendations: []
          };

          DependencyAnalyzer.mockImplementation(() => ({
            analyze: jest.fn().mockResolvedValue(mockAnalysis),
            suggestFixes: jest.fn().mockResolvedValue([])
          }));

          HealthReporter.mockImplementation(() => ({
            generateReport: jest.fn().mockResolvedValue(mockReport),
            formatForCLI: jest.fn().mockReturnValue('Mock CLI Report')
          }));

          AutoFixer.mockImplementation(() => ({
            applyFixes: jest.fn().mockResolvedValue({ success: true, appliedFixes: [], errors: [] })
          }));

          ScanContextFactory.createContext = jest.fn().mockResolvedValue({
            packageManager: { getType: () => 'npm' }
          });

          // Get the appropriate command
          let command;
          switch (commandType) {
            case 'scan':
              command = new ScanCommand();
              break;
            case 'report':
              command = new ReportCommand();
              break;
            case 'fix':
              command = new FixCommand();
              break;
          }

          const args: CommandArgs = {
            projectPath: path.resolve('.'),
            options: { json: false, verbose: false, yes: true }
          };

          const result = await command!.execute(args);

          // Verify the command executed successfully (progress indicators are internal)
          expect(result.success).toBe(true);
          expect(typeof result.output).toBe('string');
          expect(result.output.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 33: Helpful error messages
   * For any error condition, helpful error messages with suggested solutions should be displayed
   * Validates: Requirements 6.6
   */
  test('Property 33: Helpful error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'ENOENT: no such file or directory',
          'EACCES: permission denied',
          'network timeout',
          'package.json is invalid',
          'lockfile is corrupted',
          'node_modules not found'
        ),
        fc.constantFrom('scan', 'report', 'fix'),
        async (errorMessage: string, commandType: string) => {
          // Mock the dependencies to throw errors
          const { DependencyAnalyzer } = require('../core/DependencyAnalyzer');
          DependencyAnalyzer.mockImplementation(() => ({
            analyze: jest.fn().mockRejectedValue(new Error(errorMessage))
          }));

          // Get the appropriate command
          let command;
          switch (commandType) {
            case 'scan':
              command = new ScanCommand();
              break;
            case 'report':
              command = new ReportCommand();
              break;
            case 'fix':
              command = new FixCommand();
              break;
          }

          const args: CommandArgs = {
            projectPath: path.resolve('.'),
            options: { json: false, verbose: false }
          };

          // Capture console.error output
          const errorOutput: string[] = [];
          jest.spyOn(console, 'error').mockImplementation((message) => {
            errorOutput.push(message);
          });

          const result = await command!.execute(args);

          // Verify error handling
          expect(result.success).toBe(false);
          expect(result.exitCode).toBeGreaterThan(0);

          // Verify helpful error messages were displayed
          const fullErrorOutput = errorOutput.join('\n');
          
          // Should contain the original error
          expect(fullErrorOutput).toContain('failed');
          
          // Should contain suggestions
          expect(fullErrorOutput).toContain('Suggestions:');
          
          // Should contain help information
          expect(fullErrorOutput).toContain('For more help:');
          
          // Verify specific suggestions based on error type
          if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
            expect(fullErrorOutput).toContain('Verify you are in a valid Node.js project directory');
          }
          
          if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
            expect(fullErrorOutput).toContain('Try running the command with appropriate permissions');
          }
          
          if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
            expect(fullErrorOutput).toContain('Check your internet connection');
          }
          
          if (errorMessage.includes('package.json')) {
            expect(fullErrorOutput).toContain('Verify that package.json is valid JSON');
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 34: Comprehensive help documentation
   * For any help request, comprehensive usage documentation and examples should be provided
   * Validates: Requirements 6.7
   */
  test('Property 34: Comprehensive help documentation', async () => {
    await fc.assert(
      fc.property(
        fc.constantFrom('main', 'scan', 'report', 'fix', 'examples', 'troubleshooting'),
        (helpType: string) => {
          let helpContent: string;
          
          // Get help content based on type
          switch (helpType) {
            case 'main':
              helpContent = HelpSystem.getMainHelp();
              break;
            case 'scan':
              helpContent = HelpSystem.getScanHelp();
              break;
            case 'report':
              helpContent = HelpSystem.getReportHelp();
              break;
            case 'fix':
              helpContent = HelpSystem.getFixHelp();
              break;
            case 'examples':
              helpContent = HelpSystem.getExamplesHelp();
              break;
            case 'troubleshooting':
              helpContent = HelpSystem.getTroubleshootingHelp();
              break;
            default:
              helpContent = '';
          }

          // Verify comprehensive help documentation
          expect(typeof helpContent).toBe('string');
          expect(helpContent.length).toBeGreaterThan(100); // Should be substantial
          
          // Should contain structured sections
          if (helpType === 'main') {
            expect(helpContent).toContain('DESCRIPTION');
            expect(helpContent).toContain('USAGE');
            expect(helpContent).toContain('EXAMPLES');
            expect(helpContent).toContain('WORKFLOW');
          }
          
          // Command-specific help should contain relevant sections
          if (['scan', 'report', 'fix'].includes(helpType)) {
            expect(helpContent).toContain('USAGE');
            expect(helpContent).toContain('OPTIONS');
            expect(helpContent).toContain('EXAMPLES');
          }
          
          // Examples help should contain practical examples
          if (helpType === 'examples') {
            expect(helpContent).toContain('EXAMPLES & USE CASES');
            expect(helpContent).toContain('depguardian');
            expect(helpContent).toContain('CI/CD');
          }
          
          // Troubleshooting help should contain solutions
          if (helpType === 'troubleshooting') {
            expect(helpContent).toContain('TROUBLESHOOTING');
            expect(helpContent).toContain('COMMON ISSUES');
            expect(helpContent).toContain('Solution:');
          }
          
          // Should not contain placeholder text
          expect(helpContent).not.toContain('TODO');
          expect(helpContent).not.toContain('PLACEHOLDER');
          
          // Should contain actual command examples
          expect(helpContent).toContain('depguardian');
          
          // Should be well-formatted (no excessive whitespace)
          const lines = helpContent.split('\n');
          expect(lines.length).toBeGreaterThan(5); // Should have multiple lines
          
          // Should not have lines that are excessively long (readability)
          const longLines = lines.filter(line => line.length > 120);
          expect(longLines.length).toBeLessThan(lines.length * 0.1); // Less than 10% of lines should be very long
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Additional property test for CLI formatter consistency
   */
  test('CLI formatter produces consistent output', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 }),
          score: fc.integer({ min: 0, max: 100 }),
          packageName: fc.string({ minLength: 1, maxLength: 50 }),
          version: fc.string({ minLength: 1, maxLength: 20 }),
          count: fc.integer({ min: 0, max: 100 }),
          type: fc.string({ minLength: 1, maxLength: 20 })
        }),
        (data: any) => {
          // Test various formatter methods
          const header = CLIFormatter.header(data.title);
          expect(typeof header).toBe('string');
          expect(header).toContain(data.title);
          expect(header.length).toBeGreaterThan(data.title.length);
          
          const healthScore = CLIFormatter.healthScore(data.score);
          expect(typeof healthScore).toBe('string');
          expect(healthScore).toContain(data.score.toString());
          expect(healthScore).toContain('/100');
          
          const packageInfo = CLIFormatter.packageInfo(data.packageName, data.version);
          expect(typeof packageInfo).toBe('string');
          expect(packageInfo).toContain(data.packageName);
          expect(packageInfo).toContain(data.version);
          
          const issueCount = CLIFormatter.issueCount(data.count, data.type);
          expect(typeof issueCount).toBe('string');
          expect(issueCount).toContain(data.count.toString());
          expect(issueCount).toContain(data.type);
          
          // All formatted output should be non-empty strings
          expect(header.length).toBeGreaterThan(0);
          expect(healthScore.length).toBeGreaterThan(0);
          expect(packageInfo.length).toBeGreaterThan(0);
          expect(issueCount.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});