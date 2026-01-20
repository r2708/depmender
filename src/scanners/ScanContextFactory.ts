import * as fs from 'fs-extra';
import * as path from 'path';
import { 
  ScanContext, 
  PackageJson, 
  Lockfile, 
  NodeModulesInfo, 
  PackageManagerAdapter,
  PackageManagerType 
} from '../core/types';
import { PackageManagerDetector, NPMAdapter, YarnAdapter, PNPMAdapter } from '../adapters';

/**
 * Factory for creating ScanContext objects
 * Handles the complex setup of scan context with all required dependencies
 */
export class ScanContextFactory {

  /**
   * Creates a complete scan context for a project
   */
  static async createContext(projectPath: string): Promise<ScanContext> {
    // Validate project path
    if (!(await fs.pathExists(projectPath))) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Read package.json
    const packageJson = await this.readPackageJson(projectPath);
    
    // Detect package manager
    const packageManagerType = await PackageManagerDetector.detect(projectPath);
    
    // Create package manager adapter
    const packageManager = this.createPackageManagerAdapter(packageManagerType, projectPath);
    
    // Read lockfile
    const lockfile = await this.readLockfile(packageManager, projectPath);
    
    // Scan node_modules
    const nodeModules = await this.scanNodeModules(packageManager, projectPath);
    
    return {
      projectPath,
      packageJson,
      lockfile,
      nodeModules,
      packageManager
    };
  }

  /**
   * Creates a scan context with custom package manager
   */
  static async createContextWithPackageManager(
    projectPath: string, 
    packageManagerType: PackageManagerType
  ): Promise<ScanContext> {
    // Validate project path
    if (!(await fs.pathExists(projectPath))) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Read package.json
    const packageJson = await this.readPackageJson(projectPath);
    
    // Create package manager adapter
    const packageManager = this.createPackageManagerAdapter(packageManagerType, projectPath);
    
    // Read lockfile
    const lockfile = await this.readLockfile(packageManager, projectPath);
    
    // Scan node_modules
    const nodeModules = await this.scanNodeModules(packageManager, projectPath);
    
    return {
      projectPath,
      packageJson,
      lockfile,
      nodeModules,
      packageManager
    };
  }

  /**
   * Reads and validates package.json
   */
  private static async readPackageJson(projectPath: string): Promise<PackageJson> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
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
   * Creates the appropriate package manager adapter
   */
  private static createPackageManagerAdapter(
    packageManagerType: PackageManagerType, 
    projectPath: string
  ): PackageManagerAdapter {
    switch (packageManagerType) {
      case PackageManagerType.NPM:
        return new NPMAdapter(projectPath);
      case PackageManagerType.YARN:
        return new YarnAdapter(projectPath);
      case PackageManagerType.PNPM:
        return new PNPMAdapter(projectPath);
      default:
        throw new Error(`Unsupported package manager type: ${packageManagerType}`);
    }
  }

  /**
   * Reads the lockfile using the package manager adapter
   */
  private static async readLockfile(
    packageManager: PackageManagerAdapter, 
    projectPath: string
  ): Promise<Lockfile> {
    try {
      return await packageManager.readLockfile(projectPath);
    } catch (error) {
      // If lockfile doesn't exist, create a minimal one
      console.warn(`Could not read lockfile: ${error}`);
      
      return {
        type: packageManager.getType(),
        content: {},
        path: ''
      };
    }
  }

  /**
   * Scans node_modules directory
   */
  private static async scanNodeModules(
    packageManager: PackageManagerAdapter, 
    projectPath: string
  ): Promise<NodeModulesInfo> {
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    
    try {
      const packages = await packageManager.getInstalledPackages(projectPath);
      
      return {
        path: nodeModulesPath,
        packages
      };
    } catch (error) {
      console.warn(`Could not scan node_modules: ${error}`);
      
      return {
        path: nodeModulesPath,
        packages: []
      };
    }
  }

  /**
   * Validates a scan context
   */
  static validateContext(context: ScanContext): void {
    if (!context.projectPath) {
      throw new Error('Project path is required');
    }
    
    if (!context.packageJson) {
      throw new Error('Package.json is required');
    }
    
    if (!context.packageManager) {
      throw new Error('Package manager adapter is required');
    }
    
    if (!context.lockfile) {
      throw new Error('Lockfile is required');
    }
    
    if (!context.nodeModules) {
      throw new Error('Node modules info is required');
    }
  }

  /**
   * Creates a minimal scan context for testing
   */
  static createTestContext(
    projectPath: string,
    packageJson: PackageJson,
    packageManagerType: PackageManagerType = PackageManagerType.NPM
  ): ScanContext {
    const packageManager = this.createPackageManagerAdapter(packageManagerType, projectPath);
    
    return {
      projectPath,
      packageJson,
      lockfile: {
        type: packageManagerType,
        content: {},
        path: ''
      },
      nodeModules: {
        path: path.join(projectPath, 'node_modules'),
        packages: []
      },
      packageManager
    };
  }
}