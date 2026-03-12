import * as semver from 'semver';
import fetch from 'node-fetch';
import { BaseDependencyScanner } from './BaseDependencyScanner';
import {
  ScanContext,
  ScanResult,
  ScannerType,
  DependencyIssue,
  IssueType,
  IssueSeverity,
} from '../core/types';
import { CacheManager } from '../utils/CacheManager';

/**
 * Scanner that detects outdated packages by comparing current versions to latest available versions
 */
export class OutdatedScanner extends BaseDependencyScanner {
  private readonly registryUrl: string;
  private readonly timeout: number;
  private readonly cacheManager: CacheManager;
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds

  constructor(registryUrl: string = 'https://registry.npmjs.org', timeout: number = 5000) {
    super();
    this.registryUrl = registryUrl;
    this.timeout = timeout;
    this.cacheManager = CacheManager.getInstance();
  }

  getScannerType(): ScannerType {
    return ScannerType.OUTDATED;
  }

  async scan(context: ScanContext): Promise<ScanResult> {
    this.validateContext(context);

    const result = this.createBaseScanResult();
    const allDependencies = this.getAllDeclaredDependencies(context);

    // Check all dependencies in parallel for much faster scanning
    const checkPromises = Object.entries(allDependencies).map(
      async ([packageName, declaredVersion]) => {
        try {
          const issue = await this.checkPackageForUpdates(packageName, declaredVersion, context);

          return issue;
        } catch (error) {
          console.warn(`Failed to check updates for ${packageName}:`, error);
          // Continue with other packages even if one fails
          return null;
        }
      }
    );

    // Wait for all checks to complete
    const issues = await Promise.all(checkPromises);

    // Filter out null results and add to result
    result.issues.push(...issues.filter((issue): issue is DependencyIssue => issue !== null));

    return result;
  }

  /**
   * Checks if a package has available updates
   */
  private async checkPackageForUpdates(
    packageName: string,
    declaredVersion: string,
    context: ScanContext
  ): Promise<DependencyIssue | null> {
    // Get current installed version
    const installedVersion = this.getInstalledVersion(packageName, context);

    if (!installedVersion) {
      // Package not installed - this is handled by MissingScanner
      return null;
    }

    // Get latest version from registry
    const packageInfo = await this.getPackageInfo(packageName);

    if (!packageInfo || !packageInfo.latestVersion) {
      return null;
    }

    // Check if update is available
    const updateInfo = this.analyzeVersionUpdate(
      packageName,
      installedVersion,
      declaredVersion,
      packageInfo.latestVersion
    );

    if (!updateInfo.hasUpdate) {
      return null;
    }

    return {
      type: IssueType.OUTDATED,
      packageName,
      currentVersion: installedVersion,
      expectedVersion: declaredVersion,
      latestVersion: packageInfo.latestVersion,
      severity: updateInfo.severity,
      description: updateInfo.description,
      fixable: true,
    };
  }

  /**
   * Analyzes version differences and determines update severity
   */
  private analyzeVersionUpdate(
    packageName: string,
    installedVersion: string,
    declaredVersion: string,
    latestVersion: string
  ): UpdateAnalysis {
    try {
      // Clean versions for semver comparison
      const cleanInstalled = semver.clean(installedVersion);
      const cleanLatest = semver.clean(latestVersion);

      if (!cleanInstalled || !cleanLatest) {
        return {
          hasUpdate: false,
          severity: IssueSeverity.LOW,
          description: 'Invalid version format',
        };
      }

      // Check if already up to date
      if (semver.gte(cleanInstalled, cleanLatest)) {
        return { hasUpdate: false, severity: IssueSeverity.LOW, description: 'Already up to date' };
      }

      // Determine update type and severity
      const versionDiff = semver.diff(cleanInstalled, cleanLatest);

      let severity: IssueSeverity;
      let description: string;

      switch (versionDiff) {
        case 'major':
          severity = IssueSeverity.HIGH;
          description = `Major update available: ${installedVersion} → ${latestVersion}. May contain breaking changes.`;
          break;
        case 'minor':
          severity = IssueSeverity.MEDIUM;
          description = `Minor update available: ${installedVersion} → ${latestVersion}. New features added.`;
          break;
        case 'patch':
          severity = IssueSeverity.LOW;
          description = `Patch update available: ${installedVersion} → ${latestVersion}. Bug fixes and improvements.`;
          break;
        case 'prerelease':
          severity = IssueSeverity.LOW;
          description = `Prerelease update available: ${installedVersion} → ${latestVersion}.`;
          break;
        default:
          severity = IssueSeverity.MEDIUM;
          description = `Update available: ${installedVersion} → ${latestVersion}.`;
      }

      // Check if the declared version range would allow the update
      if (this.wouldVersionRangeAllowUpdate(declaredVersion, latestVersion)) {
        description += ' Can be updated by running package manager install.';
      } else {
        description += ' Requires updating version range in package.json.';
        severity = this.increaseSeverity(severity); // Increase severity if manual update needed
      }

      return { hasUpdate: true, severity, description };
    } catch (error) {
      return {
        hasUpdate: false,
        severity: IssueSeverity.LOW,
        description: `Error analyzing version: ${error}`,
      };
    }
  }

  /**
   * Checks if a version range would allow updating to a specific version
   */
  private wouldVersionRangeAllowUpdate(declaredVersion: string, targetVersion: string): boolean {
    try {
      return semver.satisfies(targetVersion, declaredVersion);
    } catch (error) {
      return false;
    }
  }

  /**
   * Increases severity level
   */
  private increaseSeverity(severity: IssueSeverity): IssueSeverity {
    switch (severity) {
      case IssueSeverity.LOW:
        return IssueSeverity.MEDIUM;
      case IssueSeverity.MEDIUM:
        return IssueSeverity.HIGH;
      case IssueSeverity.HIGH:
        return IssueSeverity.CRITICAL;
      default:
        return severity;
    }
  }

  /**
   * Gets package information from npm registry with hybrid caching
   */
  private async getPackageInfo(packageName: string): Promise<PackageInfo | null> {
    // Check persistent cache first (memory + file)
    const cached = this.cacheManager.get<PackageInfo>(`pkg:${packageName}`);
    if (cached) {
      return cached;
    }

    try {
      const url = `${this.registryUrl}/${encodeURIComponent(packageName)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'depmender/2.3.2',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Package ${packageName} not found in registry`);
        }
        return null;
      }

      const data = (await response.json()) as any;

      const packageInfo: PackageInfo = {
        name: packageName,
        latestVersion: data['dist-tags']?.latest,
        versions: Object.keys(data.versions || {}),
        description: data.description,
        homepage: data.homepage,
        repository: data.repository?.url,
      };

      // Cache the result with TTL (persists across runs)
      this.cacheManager.set(`pkg:${packageName}`, packageInfo, this.CACHE_TTL);

      return packageInfo;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn(`Timeout fetching package info for ${packageName}`);
      } else {
        console.warn(`Error fetching package info for ${packageName}:`, error);
      }
      return null;
    }
  }

  /**
   * Gets available versions for a package within a specific range
   */
  async getAvailableVersionsInRange(packageName: string, versionRange: string): Promise<string[]> {
    const packageInfo = await this.getPackageInfo(packageName);

    if (!packageInfo || !packageInfo.versions) {
      return [];
    }

    try {
      return packageInfo.versions
        .filter(version => semver.satisfies(version, versionRange))
        .sort(semver.rcompare); // Sort in descending order
    } catch (error) {
      console.warn(`Error filtering versions for ${packageName}:`, error);
      return [];
    }
  }

  /**
   * Clears the package info cache
   */
  clearCache(): void {
    // Clear only package-related cache entries
    const keys = this.cacheManager.keys();
    keys.forEach(key => {
      if (key.startsWith('pkg:')) {
        this.cacheManager.delete(key);
      }
    });
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): { size: number; packages: string[]; hitRate: number } {
    const stats = this.cacheManager.getStats();
    const packageKeys = this.cacheManager.keys().filter(k => k.startsWith('pkg:'));

    return {
      size: packageKeys.length,
      packages: packageKeys.map(k => k.replace('pkg:', '')),
      hitRate: stats.hitRate,
    };
  }
}

// Supporting interfaces
interface PackageInfo {
  name: string;
  latestVersion?: string;
  versions?: string[];
  description?: string;
  homepage?: string;
  repository?: string;
}

interface UpdateAnalysis {
  hasUpdate: boolean;
  severity: IssueSeverity;
  description: string;
}
