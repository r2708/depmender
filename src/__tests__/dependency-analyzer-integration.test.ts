import { DependencyAnalyzer } from '../core/DependencyAnalyzer';
import { ScannerRegistry } from '../scanners/ScannerRegistry';
import { 
  ScanResult, 
  ScannerType, 
  DependencyIssue, 
  SecurityIssue, 
  IssueType, 
  IssueSeverity,
  SecuritySeverity
} from '../core/types';

// Mock scanner for testing aggregation
class MockScanner {
  constructor(
    private scannerType: ScannerType,
    private mockIssues: DependencyIssue[] = [],
    private mockSecurityIssues: SecurityIssue[] = []
  ) {}

  getScannerType(): ScannerType {
    return this.scannerType;
  }

  async scan(): Promise<ScanResult> {
    return {
      scannerType: this.scannerType,
      issues: this.mockIssues,
      securityIssues: this.mockSecurityIssues
    };
  }
}

describe('DependencyAnalyzer Integration Tests', () => {
  
  test('should aggregate results from multiple scanners correctly', async () => {
    const analyzer = new DependencyAnalyzer();
    const registry = analyzer.getScannerRegistry();
    
    // Clear existing scanners
    registry.clear();
    
    // Create mock issues
    const outdatedIssue: DependencyIssue = {
      type: IssueType.OUTDATED,
      packageName: 'test-package',
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      severity: IssueSeverity.MEDIUM,
      description: 'Package is outdated',
      fixable: true
    };
    
    const missingIssue: DependencyIssue = {
      type: IssueType.MISSING,
      packageName: 'missing-package',
      severity: IssueSeverity.HIGH,
      description: 'Package is missing',
      fixable: true
    };
    
    const securityIssue: SecurityIssue = {
      packageName: 'vulnerable-package',
      version: '1.0.0',
      vulnerability: {
        id: 'CVE-2023-1234',
        title: 'Test Vulnerability',
        description: 'A test security vulnerability',
        cvss: 7.5,
        cwe: ['CWE-79'],
        references: ['https://example.com/vuln']
      },
      severity: SecuritySeverity.HIGH,
      patchAvailable: true
    };
    
    // Register mock scanners
    registry.register(new MockScanner(ScannerType.OUTDATED, [outdatedIssue]));
    registry.register(new MockScanner(ScannerType.MISSING, [missingIssue]));
    registry.register(new MockScanner(ScannerType.SECURITY, [], [securityIssue]));
    
    // Test aggregation by accessing private method
    const scanResults = await registry.runAllScanners({} as any);
    const aggregateResults = (analyzer as any).aggregateResults(scanResults);
    
    // Verify aggregation
    expect(aggregateResults.issues).toHaveLength(2);
    expect(aggregateResults.securityVulnerabilities).toHaveLength(1);
    
    // Verify issues are sorted by severity (high first)
    expect(aggregateResults.issues[0].severity).toBe(IssueSeverity.HIGH);
    expect(aggregateResults.issues[1].severity).toBe(IssueSeverity.MEDIUM);
    
    // Verify security issues
    expect(aggregateResults.securityVulnerabilities[0].packageName).toBe('vulnerable-package');
  });
  
  test('should deduplicate identical issues', async () => {
    const analyzer = new DependencyAnalyzer();
    const registry = analyzer.getScannerRegistry();
    
    // Clear existing scanners
    registry.clear();
    
    // Create duplicate issues
    const issue1: DependencyIssue = {
      type: IssueType.OUTDATED,
      packageName: 'test-package',
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      severity: IssueSeverity.MEDIUM,
      description: 'Package is outdated',
      fixable: true
    };
    
    const issue2: DependencyIssue = {
      type: IssueType.OUTDATED,
      packageName: 'test-package',
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      severity: IssueSeverity.MEDIUM,
      description: 'Package is outdated (duplicate)',
      fixable: true
    };
    
    // Register scanners with duplicate issues
    registry.register(new MockScanner(ScannerType.OUTDATED, [issue1]));
    registry.register(new MockScanner(ScannerType.VERSION_MISMATCHES, [issue2]));
    
    // Test aggregation
    const scanResults = await registry.runAllScanners({} as any);
    const aggregateResults = (analyzer as any).aggregateResults(scanResults);
    
    // Should only have one issue after deduplication
    expect(aggregateResults.issues).toHaveLength(1);
    expect(aggregateResults.issues[0].packageName).toBe('test-package');
  });
  
  test('should handle invalid scan results gracefully', async () => {
    const analyzer = new DependencyAnalyzer();
    
    // Test with invalid scan results
    const invalidResults = [
      null,
      undefined,
      { scannerType: 'invalid' },
      { scannerType: 'test', issues: null },
      { scannerType: 'test', issues: [{ invalid: 'issue' }] }
    ];
    
    const aggregateResults = (analyzer as any).aggregateResults(invalidResults);
    
    // Should handle invalid results gracefully
    expect(aggregateResults.issues).toHaveLength(0);
    expect(aggregateResults.securityVulnerabilities).toHaveLength(0);
  });
  
  test('should validate issue structures correctly', async () => {
    const analyzer = new DependencyAnalyzer();
    
    // Test valid issue
    const validIssue = {
      type: IssueType.OUTDATED,
      packageName: 'test-package',
      severity: IssueSeverity.MEDIUM,
      description: 'Test description',
      fixable: true
    };
    
    expect((analyzer as any).isValidDependencyIssue(validIssue)).toBe(true);
    
    // Test invalid issues
    const invalidIssues = [
      null,
      undefined,
      {},
      { type: 'invalid' },
      { type: IssueType.OUTDATED },
      { type: IssueType.OUTDATED, packageName: 'test', severity: 'invalid' }
    ];
    
    invalidIssues.forEach(issue => {
      expect((analyzer as any).isValidDependencyIssue(issue)).toBe(false);
    });
  });
});