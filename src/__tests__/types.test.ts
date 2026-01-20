import {
  PackageManagerType,
  IssueType,
  IssueSeverity,
  PackageJson,
  DependencyIssue,
  AnalysisResult,
  HealthReport
} from '../core/types';

describe('Core Types', () => {
  test('should create valid PackageJson object', () => {
    const packageJson: PackageJson = {
      name: 'test-package',
      version: '1.0.0',
      dependencies: {
        'lodash': '^4.17.21'
      }
    };

    expect(packageJson.name).toBe('test-package');
    expect(packageJson.version).toBe('1.0.0');
    expect(packageJson.dependencies?.lodash).toBe('^4.17.21');
  });

  test('should create valid DependencyIssue object', () => {
    const issue: DependencyIssue = {
      type: IssueType.OUTDATED,
      packageName: 'lodash',
      currentVersion: '4.17.20',
      latestVersion: '4.17.21',
      severity: IssueSeverity.MEDIUM,
      description: 'Package is outdated',
      fixable: true
    };

    expect(issue.type).toBe(IssueType.OUTDATED);
    expect(issue.packageName).toBe('lodash');
    expect(issue.fixable).toBe(true);
  });

  test('should create valid AnalysisResult object', () => {
    const result: AnalysisResult = {
      healthScore: 85,
      issues: [],
      packageManager: PackageManagerType.NPM,
      projectInfo: {
        name: 'test-project',
        version: '1.0.0',
        path: '/test/path',
        packageManager: PackageManagerType.NPM
      },
      securityVulnerabilities: []
    };

    expect(result.healthScore).toBe(85);
    expect(result.packageManager).toBe(PackageManagerType.NPM);
    expect(result.issues).toHaveLength(0);
  });

  test('should have correct enum values', () => {
    expect(PackageManagerType.NPM).toBe('npm');
    expect(PackageManagerType.YARN).toBe('yarn');
    expect(PackageManagerType.PNPM).toBe('pnpm');

    expect(IssueType.OUTDATED).toBe('outdated');
    expect(IssueType.MISSING).toBe('missing');
    expect(IssueType.SECURITY).toBe('security');

    expect(IssueSeverity.LOW).toBe('low');
    expect(IssueSeverity.CRITICAL).toBe('critical');
  });

  test('should validate health score bounds', () => {
    // Test that health score can be 0-100
    const validScores = [0, 50, 100];
    validScores.forEach(score => {
      const result: AnalysisResult = {
        healthScore: score,
        issues: [],
        packageManager: PackageManagerType.NPM,
        projectInfo: {
          name: 'test',
          version: '1.0.0',
          path: '/test',
          packageManager: PackageManagerType.NPM
        },
        securityVulnerabilities: []
      };
      
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    });
  });
});