import { BaseCommand } from './BaseCommand';
import { CommandArgs, CommandResult } from '../core/types';
import { CLIFormatter } from '../utils/CLIFormatter';
import { logger } from '../utils/Logger';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Doctor command - comprehensive system health check
 */
export class DoctorCommand extends BaseCommand {
  name = 'doctor';
  description = 'Run comprehensive system health diagnostics';
  private logger = logger.child('DoctorCommand');

  async execute(args: CommandArgs): Promise<CommandResult> {
    this.logger.info('Starting doctor command execution');
    
    try {
      console.log(CLIFormatter.header('🏥 SYSTEM HEALTH DIAGNOSIS'));
      console.log('');

      const diagnostics = await this.runDiagnostics(args.projectPath);
      const output = this.formatDiagnostics(diagnostics);
      
      console.log(output);
      
      return this.createSuccessResult(output);
    } catch (error) {
      this.logger.error('Doctor command failed', error instanceof Error ? error : undefined);
      return this.handleError(error, 'System diagnostics');
    }
  }

  /**
   * Run all diagnostic checks
   */
  private async runDiagnostics(projectPath: string): Promise<DiagnosticResults> {
    const results: DiagnosticResults = {
      nodeEnvironment: await this.checkNodeEnvironment(),
      projectStructure: await this.checkProjectStructure(projectPath),
      packageManager: await this.checkPackageManager(projectPath),
      dependencies: await this.checkDependencies(projectPath),
      performance: await this.checkPerformance(projectPath),
      security: await this.checkSecurity(projectPath),
      recommendations: []
    };

    // Generate recommendations based on findings
    results.recommendations = this.generateRecommendations(results);

    return results;
  }

  /**
   * Check Node.js environment
   */
  private async checkNodeEnvironment(): Promise<NodeEnvironmentCheck> {
    const result: NodeEnvironmentCheck = {
      nodeVersion: process.version,
      npmVersion: '',
      platform: process.platform,
      arch: process.arch,
      memory: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      issues: []
    };

    try {
      const { stdout } = await execAsync('npm --version');
      result.npmVersion = stdout.trim();
    } catch (error) {
      result.issues.push('npm not found or not accessible');
    }

    // Check Node.js version compatibility
    const majorVersion = parseInt(process.version.slice(1).split('.')[0]);
    if (majorVersion < 16) {
      result.issues.push(`Node.js ${process.version} is outdated. Minimum supported: v16.0.0`);
    } else if (majorVersion < 18) {
      result.issues.push(`Node.js ${process.version} works but v18+ recommended for better performance`);
    }

    return result;
  }

  /**
   * Check project structure
   */
  private async checkProjectStructure(projectPath: string): Promise<ProjectStructureCheck> {
    const result: ProjectStructureCheck = {
      hasPackageJson: false,
      hasLockfile: false,
      lockfileType: 'none',
      hasNodeModules: false,
      packageCount: 0,
      issues: []
    };

    // Check package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    result.hasPackageJson = await fs.pathExists(packageJsonPath);
    
    if (!result.hasPackageJson) {
      result.issues.push('package.json not found');
      return result;
    }

    // Check lockfiles
    const lockfiles = [
      { file: 'package-lock.json', type: 'npm' },
      { file: 'yarn.lock', type: 'yarn' },
      { file: 'pnpm-lock.yaml', type: 'pnpm' }
    ];

    for (const { file, type } of lockfiles) {
      if (await fs.pathExists(path.join(projectPath, file))) {
        result.hasLockfile = true;
        result.lockfileType = type as any;
        break;
      }
    }

    if (!result.hasLockfile) {
      result.issues.push('No lockfile found (package-lock.json, yarn.lock, or pnpm-lock.yaml)');
    }

    // Check node_modules
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    result.hasNodeModules = await fs.pathExists(nodeModulesPath);

    if (result.hasNodeModules) {
      try {
        const packages = await fs.readdir(nodeModulesPath);
        result.packageCount = packages.filter(pkg => !pkg.startsWith('.')).length;
      } catch (error) {
        result.issues.push('Could not read node_modules directory');
      }
    } else {
      result.issues.push('node_modules directory not found - run npm install');
    }

    return result;
  }

  /**
   * Check package manager health
   */
  private async checkPackageManager(projectPath: string): Promise<PackageManagerCheck> {
    const result: PackageManagerCheck = {
      type: 'npm',
      version: '',
      cacheSize: 0,
      registry: '',
      issues: []
    };

    try {
      // Detect package manager type
      if (await fs.pathExists(path.join(projectPath, 'yarn.lock'))) {
        result.type = 'yarn';
      } else if (await fs.pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
        result.type = 'pnpm';
      }

      // Get version
      const { stdout: version } = await execAsync(`${result.type} --version`);
      result.version = version.trim();

      // Get registry
      try {
        const { stdout: registry } = await execAsync(`${result.type} config get registry`);
        result.registry = registry.trim();
      } catch (error) {
        result.registry = 'https://registry.npmjs.org/';
      }

      // Get cache size (npm only)
      if (result.type === 'npm') {
        try {
          const { stdout: cacheInfo } = await execAsync('npm cache verify');
          const match = cacheInfo.match(/Cache size:\s*(\d+)/);
          if (match) {
            result.cacheSize = parseInt(match[1]);
          }
        } catch (error) {
          // Cache size check failed, not critical
        }
      }

    } catch (error) {
      result.issues.push(`${result.type} not found or not accessible`);
    }

    return result;
  }

  /**
   * Check dependencies
   */
  private async checkDependencies(projectPath: string): Promise<DependencyCheck> {
    const result: DependencyCheck = {
      totalDependencies: 0,
      devDependencies: 0,
      duplicates: [],
      largePackages: [],
      issues: []
    };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        
        result.totalDependencies = Object.keys(packageJson.dependencies || {}).length;
        result.devDependencies = Object.keys(packageJson.devDependencies || {}).length;

        // Check for large packages in node_modules
        const nodeModulesPath = path.join(projectPath, 'node_modules');
        if (await fs.pathExists(nodeModulesPath)) {
          result.largePackages = await this.findLargePackages(nodeModulesPath);
        }

        // Check for potential duplicates
        result.duplicates = await this.findDuplicatePackages(nodeModulesPath);
      }
    } catch (error) {
      result.issues.push('Could not analyze dependencies');
    }

    return result;
  }

  /**
   * Check performance metrics
   */
  private async checkPerformance(projectPath: string): Promise<PerformanceCheck> {
    const result: PerformanceCheck = {
      nodeModulesSize: 0,
      installTime: 0,
      issues: []
    };

    try {
      // Calculate node_modules size
      const nodeModulesPath = path.join(projectPath, 'node_modules');
      if (await fs.pathExists(nodeModulesPath)) {
        result.nodeModulesSize = await this.calculateDirectorySize(nodeModulesPath);
      }

      // Estimate install time (rough calculation)
      if (result.nodeModulesSize > 0) {
        result.installTime = Math.round(result.nodeModulesSize / 10); // Rough estimate: 10MB per second
      }

    } catch (error) {
      result.issues.push('Could not calculate performance metrics');
    }

    return result;
  }

  /**
   * Check security aspects
   */
  private async checkSecurity(projectPath: string): Promise<SecurityCheck> {
    const result: SecurityCheck = {
      auditResults: null,
      vulnerabilityCount: 0,
      issues: []
    };

    try {
      // Run npm audit
      const { stdout } = await execAsync('npm audit --json', { 
        cwd: projectPath,
        timeout: 30000 
      });
      
      result.auditResults = JSON.parse(stdout);
      result.vulnerabilityCount = result.auditResults?.metadata?.vulnerabilities?.total || 0;
      
    } catch (error) {
      // npm audit might fail with non-zero exit code if vulnerabilities found
      if (error instanceof Error && 'stdout' in error) {
        try {
          result.auditResults = JSON.parse((error as any).stdout);
          result.vulnerabilityCount = result.auditResults?.metadata?.vulnerabilities?.total || 0;
        } catch (parseError) {
          result.issues.push('Could not parse npm audit results');
        }
      } else {
        result.issues.push('npm audit failed to run');
      }
    }

    return result;
  }

  /**
   * Find large packages in node_modules
   */
  private async findLargePackages(nodeModulesPath: string): Promise<Array<{name: string, size: number}>> {
    const largePackages: Array<{name: string, size: number}> = [];
    
    try {
      const packages = await fs.readdir(nodeModulesPath);
      
      for (const pkg of packages) {
        if (pkg.startsWith('.')) continue;
        
        const pkgPath = path.join(nodeModulesPath, pkg);
        const stat = await fs.stat(pkgPath);
        
        if (stat.isDirectory()) {
          const size = await this.calculateDirectorySize(pkgPath);
          if (size > 10) { // Larger than 10MB
            largePackages.push({ name: pkg, size });
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return largePackages.sort((a, b) => b.size - a.size).slice(0, 5);
  }

  /**
   * Find duplicate packages
   */
  private async findDuplicatePackages(nodeModulesPath: string): Promise<string[]> {
    const duplicates: string[] = [];
    
    try {
      // This is a simplified check - in reality, we'd need to traverse nested node_modules
      const packages = await fs.readdir(nodeModulesPath);
      const packageVersions = new Map<string, string[]>();
      
      for (const pkg of packages) {
        if (pkg.startsWith('.') || pkg.startsWith('@')) continue;
        
        const pkgJsonPath = path.join(nodeModulesPath, pkg, 'package.json');
        if (await fs.pathExists(pkgJsonPath)) {
          try {
            const pkgJson = await fs.readJson(pkgJsonPath);
            const name = pkgJson.name;
            const version = pkgJson.version;
            
            if (!packageVersions.has(name)) {
              packageVersions.set(name, []);
            }
            packageVersions.get(name)!.push(version);
          } catch (error) {
            // Ignore package.json read errors
          }
        }
      }
      
      // Find packages with multiple versions
      for (const [name, versions] of packageVersions) {
        if (new Set(versions).size > 1) {
          duplicates.push(name);
        }
      }
      
    } catch (error) {
      // Ignore errors
    }

    return duplicates.slice(0, 10);
  }

  /**
   * Calculate directory size in MB
   */
  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory()) {
          totalSize += await this.calculateDirectorySize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }
    } catch (error) {
      // Ignore errors
    }
    
    return Math.round(totalSize / 1024 / 1024); // Convert to MB
  }

  /**
   * Generate recommendations based on diagnostic results
   */
  private generateRecommendations(results: DiagnosticResults): string[] {
    const recommendations: string[] = [];

    // Node environment recommendations
    if (results.nodeEnvironment.issues.length > 0) {
      recommendations.push('Update Node.js to the latest LTS version');
    }

    // Project structure recommendations
    if (!results.projectStructure.hasLockfile) {
      recommendations.push('Generate a lockfile by running npm install, yarn install, or pnpm install');
    }

    if (!results.projectStructure.hasNodeModules) {
      recommendations.push('Install dependencies by running npm install');
    }

    // Package manager recommendations
    if (results.packageManager.cacheSize > 1000) {
      recommendations.push('Clear package manager cache to free up disk space');
    }

    // Dependency recommendations
    if (results.dependencies.largePackages.length > 0) {
      recommendations.push('Consider alternatives to large packages to reduce bundle size');
    }

    if (results.dependencies.duplicates.length > 0) {
      recommendations.push('Resolve duplicate dependencies to reduce node_modules size');
    }

    // Performance recommendations
    if (results.performance.nodeModulesSize > 500) {
      recommendations.push('Consider using pnpm for better disk space efficiency');
    }

    // Security recommendations
    if (results.security.vulnerabilityCount > 0) {
      recommendations.push('Run npm audit fix to resolve security vulnerabilities');
    }

    return recommendations;
  }

  /**
   * Format diagnostic results for display
   */
  private formatDiagnostics(results: DiagnosticResults): string {
    const lines: string[] = [];

    // Node.js Environment
    lines.push(this.formatSection('✅ Node.js Environment', [
      `Version: ${results.nodeEnvironment.nodeVersion} ${this.getNodeVersionStatus(results.nodeEnvironment.nodeVersion)}`,
      `npm: ${results.nodeEnvironment.npmVersion || 'Not found'}`,
      `Platform: ${results.nodeEnvironment.platform} (${results.nodeEnvironment.arch})`,
      `Memory: ${results.nodeEnvironment.memory}MB available`
    ], results.nodeEnvironment.issues));

    // Project Structure
    const structureStatus = results.projectStructure.issues.length === 0 ? '✅' : '⚠️';
    lines.push(this.formatSection(`${structureStatus} Project Structure`, [
      `package.json: ${results.projectStructure.hasPackageJson ? '✓ Found' : '✗ Missing'}`,
      `Lock file: ${results.projectStructure.hasLockfile ? `${results.projectStructure.lockfileType} found` : 'Not found'}`,
      `node_modules: ${results.projectStructure.hasNodeModules ? `${results.projectStructure.packageCount} packages` : 'Not found'}`
    ], results.projectStructure.issues));

    // Package Manager
    const pmStatus = results.packageManager.issues.length === 0 ? '✅' : '⚠️';
    lines.push(this.formatSection(`${pmStatus} Package Manager Health`, [
      `Type: ${results.packageManager.type} v${results.packageManager.version}`,
      `Registry: ${results.packageManager.registry}`,
      `Cache size: ${results.packageManager.cacheSize > 0 ? `${results.packageManager.cacheSize}MB` : 'Unknown'}`
    ], results.packageManager.issues));

    // Dependencies
    const depStatus = results.dependencies.issues.length === 0 ? '✅' : '⚠️';
    const depInfo = [
      `Total dependencies: ${results.dependencies.totalDependencies}`,
      `Dev dependencies: ${results.dependencies.devDependencies}`
    ];

    if (results.dependencies.largePackages.length > 0) {
      depInfo.push(`Large packages: ${results.dependencies.largePackages.map(p => `${p.name} (${p.size}MB)`).join(', ')}`);
    }

    if (results.dependencies.duplicates.length > 0) {
      depInfo.push(`Duplicate packages: ${results.dependencies.duplicates.join(', ')}`);
    }

    lines.push(this.formatSection(`${depStatus} Dependencies`, depInfo, results.dependencies.issues));

    // Performance
    const perfStatus = results.performance.issues.length === 0 ? '✅' : '⚠️';
    lines.push(this.formatSection(`${perfStatus} Performance`, [
      `node_modules size: ${results.performance.nodeModulesSize}MB`,
      `Estimated install time: ${results.performance.installTime}s`
    ], results.performance.issues));

    // Security
    const secStatus = results.security.vulnerabilityCount === 0 ? '✅' : '🔒';
    lines.push(this.formatSection(`${secStatus} Security`, [
      `Vulnerabilities: ${results.security.vulnerabilityCount} found`
    ], results.security.issues));

    // Recommendations
    if (results.recommendations.length > 0) {
      lines.push('');
      lines.push(CLIFormatter.sectionHeader('💡 Recommendations'));
      results.recommendations.forEach(rec => {
        lines.push(`   • ${rec}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Format a diagnostic section
   */
  private formatSection(title: string, info: string[], issues: string[]): string {
    const lines = [title];
    
    info.forEach(item => {
      lines.push(`   • ${item}`);
    });

    if (issues.length > 0) {
      issues.forEach(issue => {
        lines.push(`   ⚠️  ${issue}`);
      });
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Get Node.js version status
   */
  private getNodeVersionStatus(version: string): string {
    const majorVersion = parseInt(version.slice(1).split('.')[0]);
    if (majorVersion >= 20) return '(✓ Latest)';
    if (majorVersion >= 18) return '(✓ Recommended)';
    if (majorVersion >= 16) return '(✓ Supported)';
    return '(⚠️ Outdated)';
  }
}

// Type definitions for diagnostic results
interface DiagnosticResults {
  nodeEnvironment: NodeEnvironmentCheck;
  projectStructure: ProjectStructureCheck;
  packageManager: PackageManagerCheck;
  dependencies: DependencyCheck;
  performance: PerformanceCheck;
  security: SecurityCheck;
  recommendations: string[];
}

interface NodeEnvironmentCheck {
  nodeVersion: string;
  npmVersion: string;
  platform: string;
  arch: string;
  memory: number;
  issues: string[];
}

interface ProjectStructureCheck {
  hasPackageJson: boolean;
  hasLockfile: boolean;
  lockfileType: 'npm' | 'yarn' | 'pnpm' | 'none';
  hasNodeModules: boolean;
  packageCount: number;
  issues: string[];
}

interface PackageManagerCheck {
  type: 'npm' | 'yarn' | 'pnpm';
  version: string;
  cacheSize: number;
  registry: string;
  issues: string[];
}

interface DependencyCheck {
  totalDependencies: number;
  devDependencies: number;
  duplicates: string[];
  largePackages: Array<{name: string, size: number}>;
  issues: string[];
}

interface PerformanceCheck {
  nodeModulesSize: number;
  installTime: number;
  issues: string[];
}

interface SecurityCheck {
  auditResults: any;
  vulnerabilityCount: number;
  issues: string[];
}