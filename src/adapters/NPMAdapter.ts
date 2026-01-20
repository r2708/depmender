import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BasePackageManagerAdapter } from './BasePackageManagerAdapter';
import { PackageManagerType, Lockfile } from '../core/types';

const execAsync = promisify(exec);

/**
 * NPM-specific package manager adapter
 * Handles package-lock.json parsing and npm command execution
 */
export class NPMAdapter extends BasePackageManagerAdapter {
  
  getType(): PackageManagerType {
    return PackageManagerType.NPM;
  }

  /**
   * Reads and parses package-lock.json
   */
  async readLockfile(projectPath: string): Promise<Lockfile> {
    const lockfilePath = path.join(projectPath, 'package-lock.json');
    
    if (!(await fs.pathExists(lockfilePath))) {
      throw new Error(`package-lock.json not found at ${lockfilePath}`);
    }

    try {
      const lockfileContent = await fs.readJson(lockfilePath);
      
      // Validate package-lock.json structure
      if (!lockfileContent.name || !lockfileContent.version) {
        throw new Error('Invalid package-lock.json: missing name or version');
      }

      return {
        type: PackageManagerType.NPM,
        content: lockfileContent,
        path: lockfilePath
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in package-lock.json: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Installs a package using npm
   */
  async installPackage(packageName: string, version?: string): Promise<void> {
    const packageSpec = version ? `${packageName}@${version}` : packageName;
    
    try {
      const command = `npm install ${packageSpec}`;
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        timeout: 60000 // 60 second timeout
      });

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn(`NPM install warning: ${stderr}`);
      }

      console.log(`Successfully installed ${packageSpec}`);
    } catch (error: any) {
      throw new Error(`Failed to install ${packageSpec}: ${error.message}`);
    }
  }

  /**
   * Updates a package to a specific version using npm
   */
  async updatePackage(packageName: string, version: string): Promise<void> {
    const packageSpec = `${packageName}@${version}`;
    
    try {
      const command = `npm update ${packageSpec}`;
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        timeout: 60000
      });

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn(`NPM update warning: ${stderr}`);
      }

      console.log(`Successfully updated ${packageSpec}`);
    } catch (error: any) {
      throw new Error(`Failed to update ${packageSpec}: ${error.message}`);
    }
  }

  /**
   * Regenerates package-lock.json by removing it and running npm install
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

      // Run npm install to regenerate lockfile
      const { stdout, stderr } = await execAsync('npm install', {
        cwd: this.projectPath,
        timeout: 120000 // 2 minute timeout for full install
      });

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn(`NPM install warning: ${stderr}`);
      }

      console.log('Successfully regenerated package-lock.json');
    } catch (error: any) {
      throw new Error(`Failed to regenerate package-lock.json: ${error.message}`);
    }
  }

  /**
   * Gets the path to package-lock.json
   */
  protected getLockfilePath(): string {
    return path.join(this.projectPath, 'package-lock.json');
  }

  /**
   * Gets npm-specific dependency information from package-lock.json
   */
  async getDependencyTree(): Promise<NPMDependencyTree> {
    const lockfile = await this.readLockfile(this.projectPath);
    const lockContent = lockfile.content;

    return {
      name: lockContent.name,
      version: lockContent.version,
      lockfileVersion: lockContent.lockfileVersion || 1,
      dependencies: this.parseDependencies(lockContent.dependencies || {}),
      packages: this.parsePackages(lockContent.packages || {})
    };
  }

  /**
   * Parses dependencies from package-lock.json (v1 format)
   */
  private parseDependencies(dependencies: any): NPMDependency[] {
    const result: NPMDependency[] = [];

    for (const [name, info] of Object.entries(dependencies)) {
      const depInfo = info as any;
      result.push({
        name,
        version: depInfo.version,
        resolved: depInfo.resolved,
        integrity: depInfo.integrity,
        dev: depInfo.dev || false,
        optional: depInfo.optional || false,
        requires: depInfo.requires || {},
        dependencies: depInfo.dependencies ? this.parseDependencies(depInfo.dependencies) : []
      });
    }

    return result;
  }

  /**
   * Parses packages from package-lock.json (v2+ format)
   */
  private parsePackages(packages: any): NPMPackage[] {
    const result: NPMPackage[] = [];

    for (const [location, info] of Object.entries(packages)) {
      const pkgInfo = info as any;
      
      // Skip root package (empty string key)
      if (location === '') continue;

      result.push({
        location,
        name: pkgInfo.name || this.extractPackageNameFromLocation(location),
        version: pkgInfo.version,
        resolved: pkgInfo.resolved,
        integrity: pkgInfo.integrity,
        dev: pkgInfo.dev || false,
        optional: pkgInfo.optional || false,
        peer: pkgInfo.peer || false,
        engines: pkgInfo.engines || {},
        dependencies: pkgInfo.dependencies || {},
        devDependencies: pkgInfo.devDependencies || {},
        peerDependencies: pkgInfo.peerDependencies || {},
        optionalDependencies: pkgInfo.optionalDependencies || {}
      });
    }

    return result;
  }

  /**
   * Extracts package name from node_modules location path
   */
  private extractPackageNameFromLocation(location: string): string {
    const parts = location.split('/');
    
    // Handle scoped packages (@scope/package)
    if (parts[parts.length - 2]?.startsWith('@')) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
    
    return parts[parts.length - 1];
  }

  /**
   * Checks if npm is available in the system
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await execAsync('npm --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets npm version
   */
  static async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('npm --version');
      return stdout.trim();
    } catch (error) {
      throw new Error('npm is not available');
    }
  }

  /**
   * Gets npm configuration
   */
  async getNPMConfig(): Promise<NPMConfig> {
    try {
      const { stdout } = await execAsync('npm config list --json', {
        cwd: this.projectPath
      });
      
      const config = JSON.parse(stdout);
      
      return {
        registry: config.registry || 'https://registry.npmjs.org/',
        cache: config.cache,
        prefix: config.prefix,
        userconfig: config.userconfig,
        globalconfig: config.globalconfig
      };
    } catch (error: any) {
      throw new Error(`Failed to get npm config: ${error.message}`);
    }
  }
}

// NPM-specific types
export interface NPMDependencyTree {
  name: string;
  version: string;
  lockfileVersion: number;
  dependencies: NPMDependency[];
  packages: NPMPackage[];
}

export interface NPMDependency {
  name: string;
  version: string;
  resolved?: string;
  integrity?: string;
  dev: boolean;
  optional: boolean;
  requires: Record<string, string>;
  dependencies: NPMDependency[];
}

export interface NPMPackage {
  location: string;
  name: string;
  version: string;
  resolved?: string;
  integrity?: string;
  dev: boolean;
  optional: boolean;
  peer: boolean;
  engines: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
}

export interface NPMConfig {
  registry: string;
  cache?: string;
  prefix?: string;
  userconfig?: string;
  globalconfig?: string;
}