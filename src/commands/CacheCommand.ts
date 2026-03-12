import { BaseCommand } from './BaseCommand';
import { CommandArgs, CommandResult } from '../core/types';
import { CLIFormatter } from '../utils/CLIFormatter';
import { CacheManager } from '../utils/CacheManager';
import { logger } from '../utils/Logger';

/**
 * Cache command - manage depmender cache
 */
export class CacheCommand extends BaseCommand {
  name = 'cache';
  description = 'Manage depmender cache (clear, stats, info)';
  private logger = logger.child('CacheCommand');

  async execute(args: CommandArgs): Promise<CommandResult> {
    this.logger.info('Starting cache command execution');

    try {
      const action = args.options.action || 'stats';
      const cacheManager = CacheManager.getInstance();

      let output = '';

      switch (action) {
        case 'clear':
          output = this.clearCache(cacheManager);
          break;
        case 'stats':
          output = this.showStats(cacheManager);
          break;
        case 'info':
          output = this.showInfo(cacheManager);
          break;
        default:
          output = CLIFormatter.error(`Unknown action: ${action}`);
          output += '\n\nAvailable actions: clear, stats, info';
          return this.createErrorResult(output);
      }

      console.log(output);
      return this.createSuccessResult(output);
    } catch (error) {
      this.logger.error('Cache command failed', error instanceof Error ? error : undefined);
      return this.handleError(error, 'Cache management');
    }
  }

  /**
   * Clear cache
   */
  private clearCache(cacheManager: CacheManager): string {
    const stats = cacheManager.getStats();
    cacheManager.clearAll();

    const lines: string[] = [];
    lines.push('✅ Cache cleared successfully!');
    lines.push('');
    lines.push(`📊 Cleared ${stats.size} cache entries`);
    lines.push(`💾 Cache file: ${cacheManager.getCacheFilePath()}`);

    return lines.join('\n');
  }

  /**
   * Show cache statistics
   */
  private showStats(cacheManager: CacheManager): string {
    const stats = cacheManager.getStats();
    const sizeInBytes = cacheManager.getSizeInBytes();
    const sizeInKB = (sizeInBytes / 1024).toFixed(2);

    const lines: string[] = [];
    lines.push('📊 CACHE STATISTICS');
    lines.push('');
    lines.push(`Cache Entries: ${stats.size}`);
    lines.push(`Cache Hits: ${stats.hits}`);
    lines.push(`Cache Misses: ${stats.misses}`);
    lines.push(`Hit Rate: ${stats.hitRate.toFixed(2)}%`);
    lines.push(`Cache Size: ${sizeInKB} KB`);
    lines.push('');

    if (stats.hitRate > 0) {
      lines.push('💡 Cache is working! Network calls reduced by ' + stats.hitRate.toFixed(0) + '%');
    } else if (stats.size > 0) {
      lines.push('💡 Cache populated but no hits yet. Run commands again to see benefits.');
    } else {
      lines.push('💡 Cache is empty. Run check or report commands to populate it.');
    }

    return lines.join('\n');
  }

  /**
   * Show cache information
   */
  private showInfo(cacheManager: CacheManager): string {
    const stats = cacheManager.getStats();
    const keys = cacheManager.keys();
    const packageKeys = keys.filter(k => k.startsWith('pkg:')).map(k => k.replace('pkg:', ''));

    const lines: string[] = [];
    lines.push('ℹ️  CACHE INFORMATION');
    lines.push('');
    lines.push(`Cache Location: ${cacheManager.getCacheFilePath()}`);
    lines.push(`Total Entries: ${stats.size}`);
    lines.push(`Package Entries: ${packageKeys.length}`);
    lines.push('');

    if (packageKeys.length > 0) {
      lines.push('📦 Cached Packages:');
      const displayLimit = 20;
      const displayPackages = packageKeys.slice(0, displayLimit);
      displayPackages.forEach(pkg => {
        lines.push(`   • ${pkg}`);
      });

      if (packageKeys.length > displayLimit) {
        lines.push(`   ... and ${packageKeys.length - displayLimit} more`);
      }
    } else {
      lines.push('No packages cached yet.');
    }

    return lines.join('\n');
  }
}
