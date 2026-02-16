// Core type definitions for Depguardian

// Package Manager Types
export enum PackageManagerType {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm'
}

// Issue Types and Severity
export enum IssueType {
  OUTDATED = 'outdated',
  MISSING = 'missing',
  BROKEN = 'broken',
  PEER_CONFLICT = 'peer-conflict',
  VERSION_MISMATCH = 'version-mismatch',
  SECURITY = 'security'
}

export enum IssueSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum SecuritySeverity {
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Scanner Types
export enum ScannerType {
  OUTDATED = 'outdated',
  MISSING = 'missing',
  BROKEN = 'broken',
  PEER_CONFLICTS = 'peer-conflicts',
  VERSION_MISMATCHES = 'version-mismatches',
  SECURITY = 'security'
}

// Fix Types
export enum FixType {
  INSTALL_MISSING = 'install-missing',
  UPDATE_OUTDATED = 'update-outdated',
  RESOLVE_CONFLICT = 'resolve-conflict',
  REGENERATE_LOCKFILE = 'regenerate-lockfile'
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Conflict Types
export enum ConflictType {
  VERSION_RANGE = 'version-range',
  PEER_DEPENDENCY = 'peer-dependency',
  TRANSITIVE = 'transitive'
}

export enum ConflictSeverity {
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum ResolutionStrategy {
  UPDATE_TO_COMPATIBLE = 'update-to-compatible',
  DOWNGRADE_TO_COMPATIBLE = 'downgrade-to-compatible',
  ADD_PEER_DEPENDENCY = 'add-peer-dependency',
  REMOVE_CONFLICTING = 'remove-conflicting'
}

// Core Data Structures
export interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

export interface DependencyIssue {
  type: IssueType;
  packageName: string;
  currentVersion?: string;
  expectedVersion?: string;
  latestVersion?: string;
  severity: IssueSeverity;
  description: string;
  fixable: boolean;
}

export interface VulnerabilityInfo {
  id: string;
  title: string;
  description: string;
  cvss: number;
  cwe: string[];
  references: string[];
}

export interface SecurityIssue {
  packageName: string;
  version: string;
  vulnerability: VulnerabilityInfo;
  severity: SecuritySeverity;
  fixedIn?: string;
  patchAvailable: boolean;
}

export interface ProjectInfo {
  name: string;
  version: string;
  path: string;
  packageManager: PackageManagerType;
}

export interface AnalysisResult {
  healthScore: number;
  issues: DependencyIssue[];
  packageManager: PackageManagerType;
  projectInfo: ProjectInfo;
  securityVulnerabilities: SecurityIssue[];
}

// Health Scoring
export interface HealthScoreFactors {
  outdatedPackages: number;      // Weight: 20%
  securityIssues: number;        // Weight: 40%
  peerConflicts: number;         // Weight: 15%
  missingPackages: number;       // Weight: 15%
  brokenInstallations: number;   // Weight: 10%
}

// Reporting Types
export interface ReportSummary {
  totalPackages: number;
  issuesFound: number;
  criticalIssues: number;
  securityVulnerabilities: number;
  healthScore: number;
}

export interface OutdatedPackage {
  name: string;
  currentVersion: string;
  latestVersion: string;
  type: 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency';
}

export interface PeerConflict {
  packageName: string;
  requiredBy: string[];
  conflictingVersions: string[];
  suggestedResolution?: string;
}

export interface Recommendation {
  type: 'update' | 'install' | 'remove' | 'resolve-conflict';
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  commands?: string[];
}

export interface HealthReport {
  healthScore: number;
  summary: ReportSummary;
  outdatedPackages: OutdatedPackage[];
  securityIssues: SecurityIssue[];
  peerConflicts: PeerConflict[];
  recommendations: Recommendation[];
  projectInfo: ProjectInfo;
}

// Scanner Interfaces
export interface NodeModulesInfo {
  path: string;
  packages: InstalledPackage[];
}

export interface InstalledPackage {
  name: string;
  version: string;
  path: string;
  isValid: boolean;
}

export interface Lockfile {
  type: PackageManagerType;
  content: any; // Parsed lockfile content (varies by package manager)
  path: string;
}

export interface ScanContext {
  projectPath: string;
  packageJson: PackageJson;
  lockfile: Lockfile;
  nodeModules: NodeModulesInfo;
  packageManager: PackageManagerAdapter;
}

export interface ScanResult {
  scannerType: ScannerType;
  issues: DependencyIssue[];
  securityIssues?: SecurityIssue[];
}

// Package Manager Adapter Interface
export interface PackageManagerAdapter {
  getType(): PackageManagerType;
  readLockfile(projectPath: string): Promise<Lockfile>;
  getInstalledPackages(projectPath: string): Promise<InstalledPackage[]>;
  installPackage(packageName: string, version?: string): Promise<void>;
  updatePackage(packageName: string, version: string): Promise<void>;
  removePackage(packageName: string): Promise<void>;
  regenerateLockfile(): Promise<void>;
}

// Scanner Interface
export interface DependencyScanner {
  scan(context: ScanContext): Promise<ScanResult>;
  getScannerType(): ScannerType;
}

// CLI Interfaces
export interface CommandArgs {
  projectPath: string;
  options: Record<string, any>;
}

export interface CommandResult {
  success: boolean;
  output: string;
  exitCode: number;
}

export interface CLICommand {
  name: string;
  description: string;
  execute(args: CommandArgs): Promise<CommandResult>;
}

// Core Application Interface
export interface DependencyAnalyzer {
  analyze(projectPath: string): Promise<AnalysisResult>;
  generateReport(analysis: AnalysisResult): Promise<HealthReport>;
  suggestFixes(analysis: AnalysisResult): Promise<FixSuggestion[]>;
  applyFixes(fixes: FixSuggestion[]): Promise<FixResult>;
}

// Health Reporter Interface
export interface HealthReporter {
  generateReport(analysis: AnalysisResult): Promise<HealthReport>;
  formatForCLI(report: HealthReport): string;
  formatForJSON(report: HealthReport): string;
}

// Auto-Fixer Types and Interfaces
export interface FixAction {
  type: 'install' | 'update' | 'remove' | 'regenerate-lockfile';
  packageName?: string;
  version?: string;
  command?: string;
}

export interface FixSuggestion {
  type: FixType;
  description: string;
  risk: RiskLevel;
  actions: FixAction[];
  estimatedImpact: string;
}

export interface BackupInfo {
  originalPath: string;
  backupPath: string;
  timestamp: Date;
}

export interface FixResult {
  success: boolean;
  appliedFixes: FixSuggestion[];
  errors: string[];
  backup?: BackupInfo;
}

export interface AutoFixer {
  generateFixes(analysis: AnalysisResult): Promise<FixSuggestion[]>;
  applyFixes(fixes: FixSuggestion[]): Promise<FixResult>;
  createBackup(projectPath: string): Promise<BackupInfo>;
  restoreBackup(backupInfo: BackupInfo): Promise<void>;
}

// Conflict Resolution Types and Interfaces
export interface ConflictingPackage {
  name: string;
  version: string;
  requiredBy: string;
  conflictsWith: string[];
}

export interface Conflict {
  type: ConflictType;
  packages: ConflictingPackage[];
  description: string;
  severity: ConflictSeverity;
}

export interface PackageChange {
  packageName: string;
  fromVersion: string;
  toVersion: string;
  changeType: 'update' | 'downgrade' | 'install' | 'remove';
}

export interface RiskAssessment {
  level: RiskLevel;
  factors: string[];
  mitigations: string[];
}

export interface Resolution {
  strategy: ResolutionStrategy;
  changes: PackageChange[];
  explanation: string;
  riskAssessment: RiskAssessment;
}

export interface ConflictResolver {
  detectConflicts(analysis: AnalysisResult): Promise<Conflict[]>;
  resolveConflict(conflict: Conflict): Promise<Resolution>;
  validateResolution(resolution: Resolution): Promise<boolean>;
}

// Error Handling Types
export enum ErrorSeverity {
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface DepguardianError extends Error {
  code: string;
  severity: ErrorSeverity;
  context?: Record<string, any>;
}

export interface ErrorResult {
  handled: boolean;
  recovery?: string;
  suggestions: string[];
}

export interface ErrorHandler {
  handleError(error: DepguardianError): Promise<ErrorResult>;
  canRecover(error: DepguardianError): boolean;
  suggestFix(error: DepguardianError): string[];
}
