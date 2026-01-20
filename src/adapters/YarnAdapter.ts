import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BasePackageManagerAdapter } from './BasePackageManagerAdapter';
import { PackageManagerType, Lockfile } from '../core/types';

const execAsync = promisify(exec);

/**
 * Yarn-specific package manager adapter
 * Handles yarn.lock parsing and yarn command execution
 */
export class YarnAdapter extends BasePackageManagerAdapter {
  
  getType(): PackageManagerType {
    return PackageManagerType.YARN;
  }

  /**
   * Reads and parses yarn.lock
   */
  async readLockfile(projectPath: string): Promise<Lockfile> {
    const lockfilePath = path.join(projectPath, 'yarn.lock');
    
    if (!(await fs.pathExists(lockfilePath))) {
      throw new Error(`yarn.lock not found at ${lockfilePath}`);
    }

    try {
      const lockfileContent = await fs.readFile(lockfilePath, 'utf8');
      
      // Parse yarn.lock format (it's not JSON, it's a custom format)
      const parsedContent = this.parseYarnLock(lockfileContent);
      
      return {
        type: PackageManagerType.YARN,
        content: parsedContent,
        path: lockfilePath
      };
    } catch (error: any) {
      throw new Error(`Failed to read yarn.lock: ${error.message}`);
    }
  }

  /**
   * Installs a package using yarn
   */
  async installPackage(packageName: string, version?: string): Promise<void> {
    const packageSpec = version ? `${packageName}@${version}` : packageName;
    
    try {
      const command = `yarn add ${packageSpec}`;
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        timeout: 60000 // 60 second timeout
      });

      if (stderr && !stderr.includes('warning')) {
        console.warn(`Yarn install warning: ${stderr}`);
      }

      console.log(`Successfully installed ${packageSpec} with yarn`);
    } catch (error: any) {
      throw new Error(`Failed to install ${packageSpec} with yarn: ${error.message}`);
    }
  }

  /**
   * Updates a package to a specific version using yarn
   */
  async updatePackage(packageName: string, version: string): Promise<void> {
    const packageSpec = `${packageName}@${version}`;
    
    try {
      const command = `yarn upgrade ${packageSpec}`;
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        timeout: 60000
      });

      if (stderr && !stderr.includes('warning')) {
        console.warn(`Yarn update warning: ${stderr}`);
      }

      console.log(`Successfully updated ${packageSpec} with yarn`);
    } catch (error: any) {
      throw new Error(`Failed to update ${packageSpec} with yarn: ${error.message}`);
    }
  }

  /**
   * Regenerates yarn.lock by removing it and running yarn install
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

      // Run yarn install to regenerate lockfile
      const { stdout, stderr } = await execAsync('yarn install', {
        cwd: this.projectPath,
        timeout: 120000 // 2 minute timeout for full install
      });

      if (stderr && !stderr.includes('warning')) {
        console.warn(`Yarn install warning: ${stderr}`);
      }

      console.log('Successfully regenerated yarn.lock');
    } catch (error: any) {
      throw new Error(`Failed to regenerate yarn.lock: ${error.message}`);
    }
  }

  /**
   * Gets the path to yarn.lock
   */
  protected getLockfilePath(): string {
    return path.join(this.projectPath, 'yarn.lock');
  }

  /**
   * Gets yarn-specific dependency information from yarn.lock
   */
  async getDependencyTree(): Promise<YarnDependencyTree> {
    const lockfile = await this.readLockfile(this.projectPath);
    const lockContent = lockfile.content as YarnLockContent;

    return {
      yarnVersion: lockContent.yarnVersion || '1',
      dependencies: lockContent.dependencies || {},
      metadata: lockContent.metadata || {}
    };
  }

  /**
   * Parses yarn.lock file format
   * Note: This is a simplified parser. For production use, consider using @yarnpkg/lockfile
   */
  private parseYarnLock(content: string): YarnLockContent {
    const lines = content.split('\n');
    const dependencies: Record<string, YarnDependency> = {};
    let currentPackage: string | null = null;
    let currentDependency: Partial<YarnDependency> = {};
    let yarnVersion = '1';
    let inDependenciesSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments (except version comment)
      if (!trimmedLine) {
        continue;
      }
      
      // Check for yarn version
      if (trimmedLine.startsWith('# yarn lockfile v')) {
        const versionMatch = trimmedLine.match(/# yarn lockfile v(\d+)/);
        if (versionMatch) {
          yarnVersion = versionMatch[1];
        }
        continue;
      }
      
      // Skip other comments
      if (trimmedLine.startsWith('#')) {
        continue;
      }
      
      // Check for package declaration (no indentation and ends with :)
      if (!line.startsWith(' ') && !line.startsWith('\t') && line.endsWith(':')) {
        // Save previous package if exists
        if (currentPackage && Object.keys(currentDependency).length > 0) {
          dependencies[currentPackage] = currentDependency as YarnDependency;
        }
        
        // Start new package - handle quoted package names
        let packageName = line.slice(0, -1).trim(); // Remove trailing : and trim
        if (packageName.startsWith('"') && packageName.endsWith('"')) {
          packageName = packageName.slice(1, -1); // Remove quotes
        }
        currentPackage = packageName;
        currentDependency = {};
        inDependenciesSection = false;
        continue;
      }
      
      // Parse package properties (indented lines)
      if ((line.startsWith(' ') || line.startsWith('\t')) && currentPackage) {
        const propertyLine = trimmedLine;
        
        // Handle dependencies section
        if (propertyLine === 'dependencies:') {
          inDependenciesSection = true;
          currentDependency.dependencies = {};
          continue;
        }
        
        // Handle dependency entries (more indented under dependencies:)
        if (inDependenciesSection && (line.startsWith('  ') || line.startsWith('\t\t'))) {
          const depMatch = propertyLine.match(/^(.+?)\s+"?([^"]+)"?$/);
          if (depMatch && currentDependency.dependencies) {
            const [, depName, depVersion] = depMatch;
            currentDependency.dependencies[depName] = depVersion.replace(/"/g, '');
          }
          continue;
        }
        
        // Handle regular properties
        if (!inDependenciesSection || !line.startsWith('  ')) {
          inDependenciesSection = false;
          
          const propertyMatch = propertyLine.match(/^(.+?)\s+"?([^"]+)"?$/);
          if (propertyMatch) {
            const [, key, value] = propertyMatch;
            const cleanValue = value.replace(/"/g, '');
            
            switch (key) {
              case 'version':
                currentDependency.version = cleanValue;
                break;
              case 'resolved':
                currentDependency.resolved = cleanValue;
                break;
              case 'integrity':
                currentDependency.integrity = cleanValue;
                break;
            }
          }
        }
      }
    }
    
    // Save last package
    if (currentPackage && Object.keys(currentDependency).length > 0) {
      dependencies[currentPackage] = currentDependency as YarnDependency;
    }
    
    return {
      yarnVersion,
      dependencies,
      metadata: {
        parsedAt: new Date().toISOString(),
        totalPackages: Object.keys(dependencies).length
      }
    };
  }

  /**
   * Gets yarn workspaces configuration
   */
  async getWorkspaces(): Promise<string[]> {
    try {
      const packageJson = await this.readPackageJson();
      
      if (packageJson.workspaces) {
        // Handle both array format and object format
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
   * Checks if this is a yarn workspace root
   */
  async isWorkspaceRoot(): Promise<boolean> {
    const workspaces = await this.getWorkspaces();
    return workspaces.length > 0;
  }

  /**
   * Checks if yarn is available in the system
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await execAsync('yarn --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets yarn version
   */
  static async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('yarn --version');
      return stdout.trim();
    } catch (error) {
      throw new Error('yarn is not available');
    }
  }

  /**
   * Gets yarn configuration
   */
  async getYarnConfig(): Promise<YarnConfig> {
    try {
      const { stdout } = await execAsync('yarn config list --json', {
        cwd: this.projectPath
      });
      
      // Yarn config output might be multiple JSON objects, take the last one
      const lines = stdout.trim().split('\n');
      const configLine = lines[lines.length - 1];
      const config = JSON.parse(configLine);
      
      return {
        registry: config.npmRegistryServer || config.registry || 'https://registry.yarnpkg.com',
        cacheFolder: config.cacheFolder,
        globalFolder: config.globalFolder,
        yarnPath: config.yarnPath,
        version: config.version
      };
    } catch (error: any) {
      // Fallback for older yarn versions or when JSON output is not available
      try {
        const { stdout } = await execAsync('yarn config get registry', {
          cwd: this.projectPath
        });
        
        return {
          registry: stdout.trim() || 'https://registry.yarnpkg.com'
        };
      } catch (fallbackError: any) {
        throw new Error(`Failed to get yarn config: ${error.message}`);
      }
    }
  }

  /**
   * Detects yarn version (1.x vs 2.x+)
   */
  async detectYarnVersion(): Promise<{ major: number; full: string }> {
    try {
      const version = await YarnAdapter.getVersion();
      const major = parseInt(version.split('.')[0], 10);
      
      return {
        major,
        full: version
      };
    } catch (error) {
      throw new Error('Could not detect yarn version');
    }
  }
}

// Yarn-specific types
export interface YarnDependencyTree {
  yarnVersion: string;
  dependencies: Record<string, YarnDependency>;
  metadata: Record<string, any>;
}

export interface YarnLockContent {
  yarnVersion: string;
  dependencies: Record<string, YarnDependency>;
  metadata: Record<string, any>;
}

export interface YarnDependency {
  version: string;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
}

export interface YarnConfig {
  registry: string;
  cacheFolder?: string;
  globalFolder?: string;
  yarnPath?: string;
  version?: string;
}