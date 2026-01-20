import * as fs from 'fs-extra';
import * as path from 'path';
import { PackageManagerType } from '../core/types';

/**
 * Detects the package manager used in a project based on lockfiles and configuration
 */
export class PackageManagerDetector {
  
  /**
   * Detects the package manager type for a given project path
   * Priority: pnpm > yarn > npm (based on lockfile presence)
   */
  static async detect(projectPath: string): Promise<PackageManagerType> {
    const lockfiles = [
      { file: 'pnpm-lock.yaml', type: PackageManagerType.PNPM },
      { file: 'yarn.lock', type: PackageManagerType.YARN },
      { file: 'package-lock.json', type: PackageManagerType.NPM }
    ];

    // Check for lockfiles in order of priority
    for (const { file, type } of lockfiles) {
      const lockfilePath = path.join(projectPath, file);
      if (await fs.pathExists(lockfilePath)) {
        return type;
      }
    }

    // Fallback: check for package manager specific config files
    const configFiles = [
      { file: 'pnpm-workspace.yaml', type: PackageManagerType.PNPM },
      { file: '.yarnrc', type: PackageManagerType.YARN },
      { file: '.yarnrc.yml', type: PackageManagerType.YARN },
      { file: '.npmrc', type: PackageManagerType.NPM }
    ];

    for (const { file, type } of configFiles) {
      const configPath = path.join(projectPath, file);
      if (await fs.pathExists(configPath)) {
        return type;
      }
    }

    // Final fallback: check package.json for packageManager field
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        
        if (packageJson.packageManager) {
          const packageManager = packageJson.packageManager.toLowerCase();
          if (packageManager.includes('pnpm')) return PackageManagerType.PNPM;
          if (packageManager.includes('yarn')) return PackageManagerType.YARN;
          if (packageManager.includes('npm')) return PackageManagerType.NPM;
        }

        // Check for yarn-specific fields in package.json
        if (packageJson.workspaces && !packageJson.pnpm) {
          return PackageManagerType.YARN;
        }
      }
    } catch (error) {
      // Ignore JSON parsing errors, continue with default
    }

    // Default to npm if no specific indicators found
    return PackageManagerType.NPM;
  }

  /**
   * Gets all available lockfiles in a project
   */
  static async getAvailableLockfiles(projectPath: string): Promise<string[]> {
    const lockfiles = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'];
    const availableLockfiles: string[] = [];

    for (const lockfile of lockfiles) {
      const lockfilePath = path.join(projectPath, lockfile);
      if (await fs.pathExists(lockfilePath)) {
        availableLockfiles.push(lockfile);
      }
    }

    return availableLockfiles;
  }

  /**
   * Validates if the detected package manager is consistent with available lockfiles
   */
  static async validatePackageManager(
    projectPath: string, 
    detectedType: PackageManagerType
  ): Promise<{ isValid: boolean; warnings: string[] }> {
    const availableLockfiles = await this.getAvailableLockfiles(projectPath);
    const warnings: string[] = [];

    // Check for multiple lockfiles (potential issue)
    if (availableLockfiles.length > 1) {
      warnings.push(
        `Multiple lockfiles detected: ${availableLockfiles.join(', ')}. ` +
        `This may cause dependency resolution conflicts.`
      );
    }

    // Check if detected type matches available lockfiles
    const expectedLockfile = this.getLockfileForPackageManager(detectedType);
    const hasExpectedLockfile = availableLockfiles.includes(expectedLockfile);

    if (!hasExpectedLockfile && availableLockfiles.length > 0) {
      warnings.push(
        `Detected package manager (${detectedType}) doesn't match available lockfiles: ${availableLockfiles.join(', ')}`
      );
    }

    return {
      isValid: availableLockfiles.length === 0 || hasExpectedLockfile,
      warnings
    };
  }

  /**
   * Gets the expected lockfile name for a package manager type
   */
  private static getLockfileForPackageManager(type: PackageManagerType): string {
    switch (type) {
      case PackageManagerType.PNPM:
        return 'pnpm-lock.yaml';
      case PackageManagerType.YARN:
        return 'yarn.lock';
      case PackageManagerType.NPM:
        return 'package-lock.json';
      default:
        return 'package-lock.json';
    }
  }
}