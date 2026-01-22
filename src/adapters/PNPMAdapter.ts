import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as yaml from 'yaml';
import { BasePackageManagerAdapter } from './BasePackageManagerAdapter';
import { PackageManagerType, Lockfile } from '../core/types';

const execAsync = promisify(exec);

/**
 * PNPM-specific package manager adapter
 * Handles pnpm-lock.yaml parsing and pnpm command execution
 */
export class PNPMAdapter extends BasePackageManagerAdapter {
  
  getType(): PackageManagerType {
    return PackageManagerType.PNPM;
  }

  /**
   * Reads and parses pnpm-lock.yaml
   */
  async readLockfile(projectPath: string): Promise<Lockfile> {
    const lockfilePath = path.join(projectPath, 'pnpm-lock.yaml');
    
    if (!(await fs.pathExists(lockfilePath))) {
      throw new Error(`pnpm-lock.yaml not found at ${lockfilePath}`);
    }

    try {
      const lockfileContent = await fs.readFile(lockfilePath, 'utf8');
      
      // Parse YAML content
      const parsedContent = yaml.parse(lockfileContent);
      
      // Validate pnpm-lock.yaml structure
      if (!parsedContent.lockfileVersion) {
        throw new Error('Invalid pnpm-lock.yaml: missing lockfileVersion');
      }
      
      return {
        type: PackageManagerType.PNPM,
        content: parsedContent,
        path: lockfilePath
      };
    } catch (error: any) {
      if (error.name === 'YAMLParseError') {
        throw new Error(`Invalid YAML in pnpm-lock.yaml: ${error.message}`);
      }
      throw new Error(`Failed to read pnpm-lock.yaml: ${error.message}`);
    }
  }

  /**
   * Installs a package using pnpm
   */
  async installPackage(packageName: string, version?: string): Promise<void> {
    const packageSpec = version ? `${packageName}@${version}` : packageName;
    
    try {
      const command = `pnpm add ${packageSpec}`;
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        timeout: 60000 // 60 second timeout
      });

      if (stderr && !stderr.includes('WARN')) {
        console.warn(`PNPM install warning: ${stderr}`);
      }

      console.log(`Successfully installed ${packageSpec} with pnpm`);
    } catch (error: any) {
      throw new Error(`Failed to install ${packageSpec} with pnpm: ${error.message}`);
    }
  }

  /**
   * Updates a package to a specific version using pnpm
   */
  async updatePackage(packageName: string, version: string): Promise<void> {
    const packageSpec = `${packageName}@${version}`;
    
    try {
      const command = `pnpm update ${packageSpec}`;
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        timeout: 60000
      });

      if (stderr && !stderr.includes('WARN')) {
        console.warn(`PNPM update warning: ${stderr}`);
      }

      console.log(`Successfully updated ${packageSpec} with pnpm`);
    } catch (error: any) {
      throw new Error(`Failed to update ${packageSpec} with pnpm: ${error.message}`);
    }
  }

  /**
   * Removes a package using pnpm
   */
  async removePackage(packageName: string): Promise<void> {
    try {
      const command = `pnpm remove ${packageName}`;
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        timeout: 60000
      });

      if (stderr && !stderr.includes('WARN')) {
        console.warn(`PNPM remove warning: ${stderr}`);
      }

      console.log(`Removed corrupted package ${packageName} (preparing for reinstall)`);
    } catch (error: any) {
      throw new Error(`Failed to remove corrupted ${packageName} with pnpm: ${error.message}`);
    }
  }

  /**
   * Regenerates pnpm-lock.yaml by removing it and running pnpm install
   */
  async regenerateLockfile(): Promise<void> {
    const lockfilePath = this.getLockfilePath();
    
    try {
      // Remove existing lockfile if it exists
      if (await fs.pathExists(lockfilePath)) {
        await fs.remove(lockfilePath);
      }

      // Remove node_modules to ensure clean install
      const nodeModulesPath = path.join(this.projectPath, 'node_modules');
      if (await fs.pathExists(nodeModulesPath)) {
        await fs.remove(nodeModulesPath);
      }

      // Run pnpm install to regenerate lockfile
      const { stdout, stderr } = await execAsync('pnpm install', {
        cwd: this.projectPath,
        timeout: 120000 // 2 minute timeout for full install
      });

      if (stderr && !stderr.includes('WARN')) {
        console.warn(`PNPM install warning: ${stderr}`);
      }

      console.log('Successfully regenerated pnpm-lock.yaml');
    } catch (error: any) {
      throw new Error(`Failed to regenerate pnpm-lock.yaml: ${error.message}`);
    }
  }

  /**
   * Gets the path to pnpm-lock.yaml
   */
  protected getLockfilePath(): string {
    return path.join(this.projectPath, 'pnpm-lock.yaml');
  }

  /**
   * Gets pnpm-specific dependency information from pnpm-lock.yaml
   */
  async getDependencyTree(): Promise<PNPMDependencyTree> {
    const lockfile = await this.readLockfile(this.projectPath);
    const lockContent = lockfile.content;

    return {
      lockfileVersion: lockContent.lockfileVersion,
      settings: lockContent.settings || {},
      importers: lockContent.importers || {},
      packages: lockContent.packages || {},
      dependencies: this.extractDependencies(lockContent),
      devDependencies: this.extractDevDependencies(lockContent)
    };
  }

  /**
   * Extracts regular dependencies from pnpm-lock.yaml
   */
  private extractDependencies(lockContent: any): Record<string, PNPMDependency> {
    const dependencies: Record<string, PNPMDependency> = {};
    
    // Handle root dependencies
    if (lockContent.dependencies) {
      for (const [name, info] of Object.entries(lockContent.dependencies)) {
        const depInfo = info as any;
        dependencies[name] = {
          specifier: depInfo.specifier || depInfo,
          version: typeof depInfo === 'string' ? depInfo : depInfo.version,
          isDev: false
        };
      }
    }

    // Handle importer dependencies (workspace support)
    if (lockContent.importers) {
      for (const [importerPath, importer] of Object.entries(lockContent.importers)) {
        const importerInfo = importer as any;
        if (importerInfo.dependencies) {
          for (const [name, info] of Object.entries(importerInfo.dependencies)) {
            const depInfo = info as any;
            const key = importerPath === '.' ? name : `${importerPath}/${name}`;
            dependencies[key] = {
              specifier: depInfo.specifier || depInfo,
              version: typeof depInfo === 'string' ? depInfo : depInfo.version,
              isDev: false,
              importer: importerPath === '.' ? undefined : importerPath
            };
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Extracts dev dependencies from pnpm-lock.yaml
   */
  private extractDevDependencies(lockContent: any): Record<string, PNPMDependency> {
    const devDependencies: Record<string, PNPMDependency> = {};
    
    // Handle root dev dependencies
    if (lockContent.devDependencies) {
      for (const [name, info] of Object.entries(lockContent.devDependencies)) {
        const depInfo = info as any;
        devDependencies[name] = {
          specifier: depInfo.specifier || depInfo,
          version: typeof depInfo === 'string' ? depInfo : depInfo.version,
          isDev: true
        };
      }
    }

    // Handle importer dev dependencies (workspace support)
    if (lockContent.importers) {
      for (const [importerPath, importer] of Object.entries(lockContent.importers)) {
        const importerInfo = importer as any;
        if (importerInfo.devDependencies) {
          for (const [name, info] of Object.entries(importerInfo.devDependencies)) {
            const depInfo = info as any;
            const key = importerPath === '.' ? name : `${importerPath}/${name}`;
            devDependencies[key] = {
              specifier: depInfo.specifier || depInfo,
              version: typeof depInfo === 'string' ? depInfo : depInfo.version,
              isDev: true,
              importer: importerPath === '.' ? undefined : importerPath
            };
          }
        }
      }
    }

    return devDependencies;
  }

  /**
   * Gets pnpm workspace configuration
   */
  async getWorkspaces(): Promise<string[]> {
    try {
      // Check for pnpm-workspace.yaml
      const workspaceFilePath = path.join(this.projectPath, 'pnpm-workspace.yaml');
      if (await fs.pathExists(workspaceFilePath)) {
        const workspaceContent = await fs.readFile(workspaceFilePath, 'utf8');
        const workspaceConfig = yaml.parse(workspaceContent);
        
        if (workspaceConfig.packages && Array.isArray(workspaceConfig.packages)) {
          return workspaceConfig.packages;
        }
      }

      // Fallback to package.json workspaces (pnpm also supports this)
      const packageJson = await this.readPackageJson();
      if (packageJson.workspaces) {
        if (Array.isArray(packageJson.workspaces)) {
          return packageJson.workspaces;
        } else if (packageJson.workspaces.packages) {
          return packageJson.workspaces.packages;
        }
      }
      
      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Checks if this is a pnpm workspace root
   */
  async isWorkspaceRoot(): Promise<boolean> {
    const workspaces = await this.getWorkspaces();
    return workspaces.length > 0;
  }

  /**
   * Gets pnpm store path
   */
  async getStorePath(): Promise<string> {
    try {
      const { stdout } = await execAsync('pnpm store path', {
        cwd: this.projectPath
      });
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Failed to get pnpm store path: ${error.message}`);
    }
  }

  /**
   * Checks if pnpm is available in the system
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await execAsync('pnpm --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets pnpm version
   */
  static async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('pnpm --version');
      return stdout.trim();
    } catch (error) {
      throw new Error('pnpm is not available');
    }
  }

  /**
   * Gets pnpm configuration
   */
  async getPNPMConfig(): Promise<PNPMConfig> {
    try {
      const { stdout } = await execAsync('pnpm config list --json', {
        cwd: this.projectPath
      });
      
      const config = JSON.parse(stdout);
      
      return {
        registry: config.registry || 'https://registry.npmjs.org/',
        storeDir: config['store-dir'],
        cacheDir: config['cache-dir'],
        globalDir: config['global-dir'],
        shamefullyHoist: config['shamefully-hoist'],
        strictPeerDependencies: config['strict-peer-dependencies']
      };
    } catch (error: any) {
      // Fallback for when JSON output is not available
      try {
        const { stdout } = await execAsync('pnpm config get registry', {
          cwd: this.projectPath
        });
        
        return {
          registry: stdout.trim() || 'https://registry.npmjs.org/'
        };
      } catch (fallbackError: any) {
        throw new Error(`Failed to get pnpm config: ${error.message}`);
      }
    }
  }

  /**
   * Gets detailed package information from pnpm-lock.yaml packages section
   */
  getPackageDetails(packageKey: string): PNPMPackageDetails | null {
    // This would be implemented to extract detailed package info from the packages section
    // For now, return null as a placeholder
    return null;
  }
}

// PNPM-specific types
export interface PNPMDependencyTree {
  lockfileVersion: string | number;
  settings: Record<string, any>;
  importers: Record<string, any>;
  packages: Record<string, any>;
  dependencies: Record<string, PNPMDependency>;
  devDependencies: Record<string, PNPMDependency>;
}

export interface PNPMDependency {
  specifier: string;
  version: string;
  isDev: boolean;
  importer?: string;
}

export interface PNPMPackageDetails {
  resolution: {
    integrity: string;
    tarball?: string;
  };
  engines?: Record<string, string>;
  cpu?: string[];
  os?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface PNPMConfig {
  registry: string;
  storeDir?: string;
  cacheDir?: string;
  globalDir?: string;
  shamefullyHoist?: boolean;
  strictPeerDependencies?: boolean;
}