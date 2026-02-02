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
 * Clean command - remove unused dependencies
 */
export class CleanCommand extends BaseCommand {
  name = 'clean';
  description = 'Find and remove unused dependencies';
  private logger = logger.child('CleanCommand');

  async execute(args: CommandArgs): Promise<CommandResult> {
    this.logger.info('Starting clean command execution');
    
    try {
      console.log(CLIFormatter.header('🧹 DEPENDENCY CLEANUP ANALYSIS'));
      console.log('');

      const analysis = await this.analyzeUnusedDependencies(args.projectPath);
      
      if (args.options.dryRun !== false) {
        // Show what would be removed (default behavior)
        const output = this.formatAnalysisResults(analysis, true);
        console.log(output);
        console.log(CLIFormatter.info('\n💡 This was a dry run. Use --confirm to actually remove packages.'));
        return this.createSuccessResult(output);
      } else if (args.options.confirm) {
        // Actually remove the packages
        const output = await this.removeUnusedPackages(analysis, args.projectPath);
        console.log(output);
        return this.createSuccessResult(output);
      } else {
        // Show analysis and ask for confirmation
        const output = this.formatAnalysisResults(analysis, true);
        console.log(output);
        console.log(CLIFormatter.info('\n💡 Use --confirm to remove these packages or --dry-run to see what would be removed.'));
        return this.createSuccessResult(output);
      }
      
    } catch (error) {
      this.logger.error('Clean command failed', error instanceof Error ? error : undefined);
      return this.handleError(error, 'Dependency cleanup');
    }
  }

  /**
   * Analyze unused dependencies
   */
  private async analyzeUnusedDependencies(projectPath: string): Promise<CleanupAnalysis> {
    const analysis: CleanupAnalysis = {
      unusedDependencies: [],
      usedDependencies: [],
      scriptDependencies: [],
      safeDependencies: [],
      totalSavings: 0,
      filesScanned: 0,
      importsFound: 0
    };

    // Read package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!(await fs.pathExists(packageJsonPath))) {
      throw new Error('package.json not found');
    }

    const packageJson = await fs.readJson(packageJsonPath);
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    if (Object.keys(dependencies).length === 0) {
      return analysis;
    }

    // Find all source files
    const sourceFiles = await this.findSourceFiles(projectPath);
    analysis.filesScanned = sourceFiles.length;

    // Extract all imports/requires from source files
    const usedPackages = new Set<string>();
    
    for (const filePath of sourceFiles) {
      const imports = await this.extractImports(filePath);
      analysis.importsFound += imports.length;
      
      imports.forEach(imp => {
        const packageName = this.extractPackageName(imp);
        if (packageName) {
          usedPackages.add(packageName);
        }
      });
    }

    // Check script dependencies
    const scriptDeps = this.extractScriptDependencies(packageJson);
    analysis.scriptDependencies = scriptDeps;

    // Categorize dependencies
    for (const [depName, version] of Object.entries(dependencies)) {
      const isUsedInCode = usedPackages.has(depName);
      const isUsedInScripts = scriptDeps.includes(depName);
      const isSafe = this.isSafeDependency(depName);

      if (isSafe) {
        analysis.safeDependencies.push({
          name: depName,
          version: version as string,
          reason: 'Safe dependency (build tool, linter, etc.)'
        });
      } else if (isUsedInCode || isUsedInScripts) {
        analysis.usedDependencies.push({
          name: depName,
          version: version as string,
          usedInCode: isUsedInCode,
          usedInScripts: isUsedInScripts
        });
      } else {
        const size = await this.getPackageSize(projectPath, depName);
        analysis.unusedDependencies.push({
          name: depName,
          version: version as string,
          size,
          reason: 'Not imported anywhere'
        });
        analysis.totalSavings += size;
      }
    }

    return analysis;
  }

  /**
   * Find all source files in the project
   */
  private async findSourceFiles(projectPath: string): Promise<string[]> {
    const sourceFiles: string[] = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
    const sourceDirs = ['src', 'lib', 'app', 'components', 'utils', 'services'];
    
    // Check common source directories
    for (const dir of sourceDirs) {
      const dirPath = path.join(projectPath, dir);
      if (await fs.pathExists(dirPath)) {
        const files = await this.findFilesRecursively(dirPath, extensions);
        sourceFiles.push(...files);
      }
    }

    // Also check root level files
    const rootFiles = await fs.readdir(projectPath);
    for (const file of rootFiles) {
      const filePath = path.join(projectPath, file);
      const stat = await fs.stat(filePath);
      
      if (stat.isFile() && extensions.some(ext => file.endsWith(ext))) {
        sourceFiles.push(filePath);
      }
    }

    return sourceFiles;
  }

  /**
   * Find files recursively
   */
  private async findFilesRecursively(dirPath: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          const subFiles = await this.findFilesRecursively(itemPath, extensions);
          files.push(...subFiles);
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          files.push(itemPath);
        }
      }
    } catch (error) {
      // Ignore directory read errors
    }
    
    return files;
  }

  /**
   * Extract import/require statements from a file
   */
  private async extractImports(filePath: string): Promise<string[]> {
    const imports: string[] = [];
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Regex patterns for different import styles
      const patterns = [
        // ES6 imports: import ... from 'package'
        /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g,
        // CommonJS: require('package')
        /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
        // Dynamic imports: import('package')
        /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          imports.push(match[1]);
        }
      }
    } catch (error) {
      // Ignore file read errors
    }
    
    return imports;
  }

  /**
   * Extract package name from import path
   */
  private extractPackageName(importPath: string): string | null {
    // Skip relative imports
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return null;
    }

    // Handle scoped packages (@scope/package)
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    }

    // Handle regular packages
    const parts = importPath.split('/');
    return parts[0];
  }

  /**
   * Extract dependencies used in package.json scripts
   */
  private extractScriptDependencies(packageJson: any): string[] {
    const scriptDeps: string[] = [];
    const scripts = packageJson.scripts || {};
    
    for (const script of Object.values(scripts)) {
      const scriptStr = script as string;
      
      // Common patterns in scripts
      const patterns = [
        /\b(\w+(?:-\w+)*)\b/g, // Command names
        /npx\s+(\w+(?:-\w+)*)/g, // npx commands
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(scriptStr)) !== null) {
          const command = match[1];
          
          // Check if this command corresponds to a dependency
          if (packageJson.dependencies?.[command] || packageJson.devDependencies?.[command]) {
            scriptDeps.push(command);
          }
        }
      }
    }

    return [...new Set(scriptDeps)];
  }

  /**
   * Check if a dependency is considered "safe" (shouldn't be removed)
   */
  private isSafeDependency(packageName: string): boolean {
    const safePatterns = [
      // Build tools
      'webpack', 'rollup', 'vite', 'parcel',
      // Compilers
      'typescript', 'babel', '@babel/',
      // Linters and formatters
      'eslint', '@eslint/', 'prettier',
      // Testing frameworks
      'jest', 'mocha', 'chai', 'vitest', '@testing-library/',
      // Type definitions
      '@types/',
      // Framework CLI tools
      'create-react-app', '@angular/cli', 'vue-cli',
      // Package managers
      'npm', 'yarn', 'pnpm'
    ];

    return safePatterns.some(pattern => {
      if (pattern.endsWith('/')) {
        return packageName.startsWith(pattern);
      }
      return packageName === pattern || packageName.startsWith(pattern + '-');
    });
  }

  /**
   * Get package size from node_modules
   */
  private async getPackageSize(projectPath: string, packageName: string): Promise<number> {
    const packagePath = path.join(projectPath, 'node_modules', packageName);
    
    if (!(await fs.pathExists(packagePath))) {
      return 0;
    }

    try {
      return await this.calculateDirectorySize(packagePath);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate directory size in KB
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
    
    return Math.round(totalSize / 1024); // Convert to KB
  }

  /**
   * Remove unused packages
   */
  private async removeUnusedPackages(analysis: CleanupAnalysis, projectPath: string): Promise<string> {
    const lines: string[] = [];
    
    if (analysis.unusedDependencies.length === 0) {
      lines.push('✅ No unused dependencies found to remove.');
      return lines.join('\n');
    }

    lines.push('🧹 REMOVING UNUSED DEPENDENCIES');
    lines.push('='.repeat(35));
    lines.push('');

    let removedCount = 0;
    let savedSpace = 0;

    for (const dep of analysis.unusedDependencies) {
      try {
        // Remove from package.json
        await this.removeFromPackageJson(projectPath, dep.name);
        
        // Remove from node_modules
        const packagePath = path.join(projectPath, 'node_modules', dep.name);
        if (await fs.pathExists(packagePath)) {
          await fs.remove(packagePath);
        }

        lines.push(`✅ Removed ${dep.name}@${dep.version} (${dep.size}KB)`);
        removedCount++;
        savedSpace += dep.size;
        
      } catch (error) {
        lines.push(`❌ Failed to remove ${dep.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    lines.push('');
    lines.push(`📊 Summary:`);
    lines.push(`   • Packages removed: ${removedCount}`);
    lines.push(`   • Space saved: ${savedSpace}KB`);
    lines.push('');
    lines.push('💡 Run npm install to ensure lockfile is updated');

    return lines.join('\n');
  }

  /**
   * Remove dependency from package.json
   */
  private async removeFromPackageJson(projectPath: string, packageName: string): Promise<void> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);

    // Remove from dependencies or devDependencies
    if (packageJson.dependencies?.[packageName]) {
      delete packageJson.dependencies[packageName];
    }
    if (packageJson.devDependencies?.[packageName]) {
      delete packageJson.devDependencies[packageName];
    }

    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  }

  /**
   * Format analysis results
   */
  private formatAnalysisResults(analysis: CleanupAnalysis, isDryRun: boolean): string {
    const lines: string[] = [];

    if (analysis.unusedDependencies.length === 0) {
      lines.push('✅ No unused dependencies found! Your project is clean.');
      return lines.join('\n');
    }

    lines.push(`📦 Unused Dependencies Found: ${analysis.unusedDependencies.length}`);
    analysis.unusedDependencies.forEach(dep => {
      lines.push(`   • ${dep.name} (${dep.size}KB) - ${dep.reason}`);
    });

    lines.push('');
    lines.push(`💾 Potential Space Savings: ${analysis.totalSavings}KB`);
    lines.push('');

    lines.push('🔍 Analysis Details:');
    lines.push(`   • Files scanned: ${analysis.filesScanned}`);
    lines.push(`   • Import statements: ${analysis.importsFound}`);
    lines.push(`   • Dependencies checked: ${analysis.usedDependencies.length + analysis.unusedDependencies.length}`);
    lines.push(`   • Safe to remove: ${analysis.unusedDependencies.length}`);

    if (analysis.safeDependencies.length > 0) {
      lines.push('');
      lines.push('⚠️  Keep These (Safe dependencies):');
      analysis.safeDependencies.forEach(dep => {
        lines.push(`   • ${dep.name} - ${dep.reason}`);
      });
    }

    if (analysis.scriptDependencies.length > 0) {
      lines.push('');
      lines.push('🔧 Keep These (Used in scripts):');
      analysis.scriptDependencies.forEach(dep => {
        lines.push(`   • ${dep}`);
      });
    }

    return lines.join('\n');
  }
}

// Type definitions
interface CleanupAnalysis {
  unusedDependencies: UnusedDependency[];
  usedDependencies: UsedDependency[];
  scriptDependencies: string[];
  safeDependencies: SafeDependency[];
  totalSavings: number;
  filesScanned: number;
  importsFound: number;
}

interface UnusedDependency {
  name: string;
  version: string;
  size: number;
  reason: string;
}

interface UsedDependency {
  name: string;
  version: string;
  usedInCode: boolean;
  usedInScripts: boolean;
}

interface SafeDependency {
  name: string;
  version: string;
  reason: string;
}