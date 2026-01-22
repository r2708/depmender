import * as fs from 'fs-extra';
import * as path from 'path';
import { 
  PackageManagerAdapter, 
  PackageManagerType, 
  Lockfile, 
  InstalledPackage,
  PackageJson 
} from '../core/types';

/**
 * Abstract base class for package manager adapters
 * Provides common functionality shared across all package managers
 */
export abstract class BasePackageManagerAdapter implements PackageManagerAdapter {
  protected projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  abstract getType(): PackageManagerType;
  abstract readLockfile(projectPath: string): Promise<Lockfile>;
  abstract installPackage(packageName: string, version?: string): Promise<void>;
  abstract updatePackage(packageName: string, version: string): Promise<void>;
  abstract removePackage(packageName: string): Promise<void>;
  abstract regenerateLockfile(): Promise<void>;

  /**
   * Reads and parses package.json from the project
   */
  async readPackageJson(): Promise<PackageJson> {
    const packageJsonPath = path.join(this.projectPath, 'package.json');
    
    if (!(await fs.pathExists(packageJsonPath))) {
      throw new Error(`package.json not found at ${packageJsonPath}`);
    }

    try {
      const packageJson = await fs.readJson(packageJsonPath);
      
      // Validate required fields
      if (!packageJson.name || !packageJson.version) {
        throw new Error('package.json must contain name and version fields');
      }

      return packageJson as PackageJson;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in package.json: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Gets installed packages from node_modules directory
   */
  async getInstalledPackages(projectPath: string): Promise<InstalledPackage[]> {
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    
    if (!(await fs.pathExists(nodeModulesPath))) {
      return [];
    }

    const installedPackages: InstalledPackage[] = [];
    
    try {
      const entries = await fs.readdir(nodeModulesPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Handle scoped packages (e.g., @types/node)
          if (entry.name.startsWith('@')) {
            const scopedPackages = await this.getScopedPackages(
              path.join(nodeModulesPath, entry.name)
            );
            installedPackages.push(...scopedPackages);
          } else {
            const packageInfo = await this.getPackageInfo(
              path.join(nodeModulesPath, entry.name),
              entry.name
            );
            if (packageInfo) {
              installedPackages.push(packageInfo);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read node_modules directory: ${error}`);
    }

    return installedPackages;
  }

  /**
   * Gets information about scoped packages (e.g., @types/*)
   */
  private async getScopedPackages(scopePath: string): Promise<InstalledPackage[]> {
    const scopedPackages: InstalledPackage[] = [];
    
    try {
      const entries = await fs.readdir(scopePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const scopeName = path.basename(scopePath);
          const fullPackageName = `${scopeName}/${entry.name}`;
          const packageInfo = await this.getPackageInfo(
            path.join(scopePath, entry.name),
            fullPackageName
          );
          if (packageInfo) {
            scopedPackages.push(packageInfo);
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read scoped packages in ${scopePath}: ${error}`);
    }

    return scopedPackages;
  }

  /**
   * Gets package information from a package directory
   */
  private async getPackageInfo(
    packagePath: string, 
    packageName: string
  ): Promise<InstalledPackage | null> {
    try {
      const packageJsonPath = path.join(packagePath, 'package.json');
      
      if (!(await fs.pathExists(packageJsonPath))) {
        return {
          name: packageName,
          version: 'unknown',
          path: packagePath,
          isValid: false
        };
      }

      const packageJson = await fs.readJson(packageJsonPath);
      
      return {
        name: packageName,
        version: packageJson.version || 'unknown',
        path: packagePath,
        isValid: true
      };
    } catch (error) {
      return {
        name: packageName,
        version: 'unknown',
        path: packagePath,
        isValid: false
      };
    }
  }

  /**
   * Validates if a package directory has all required files
   */
  protected async validatePackageInstallation(packagePath: string): Promise<boolean> {
    try {
      // Check for package.json
      const packageJsonPath = path.join(packagePath, 'package.json');
      if (!(await fs.pathExists(packageJsonPath))) {
        return false;
      }

      // Check if package.json is valid JSON
      await fs.readJson(packageJsonPath);
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets the lockfile path for this package manager
   */
  protected abstract getLockfilePath(): string;

  /**
   * Checks if the lockfile exists
   */
  async hasLockfile(): Promise<boolean> {
    const lockfilePath = this.getLockfilePath();
    return fs.pathExists(lockfilePath);
  }
}