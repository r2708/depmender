import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { logger } from './Logger';

/**
 * Cached item with metadata
 */
interface CachedItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Cache file structure
 */
interface CacheFile {
  version: string;
  entries: Record<string, CachedItem<any>>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

/**
 * Hybrid cache manager with memory and file persistence
 * Provides fast in-memory caching with cross-session persistence
 */
export class CacheManager {
  private static instance: CacheManager;
  private memoryCache: Map<string, CachedItem<any>> = new Map();
  private cacheDir: string;
  private cacheFile: string;
  private readonly CACHE_VERSION = '1.0.0';
  private readonly DEFAULT_TTL = 3600000; // 1 hour in milliseconds
  private stats = { hits: 0, misses: 0 };
  private logger = logger.child('CacheManager');

  private constructor() {
    // Use user's home directory for cache
    this.cacheDir = path.join(os.homedir(), '.depmender');
    this.cacheFile = path.join(this.cacheDir, 'cache.json');
    this.initializeCache();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Initialize cache by loading from file
   */
  private initializeCache(): void {
    try {
      // Ensure cache directory exists
      fs.ensureDirSync(this.cacheDir);

      // Load cache from file if exists
      if (fs.existsSync(this.cacheFile)) {
        this.loadFromFile();
        this.logger.debug('Cache loaded from file');
      } else {
        this.logger.debug('No cache file found, starting fresh');
      }
    } catch (error) {
      this.logger.warn('Failed to initialize cache', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Load cache from file into memory
   */
  private loadFromFile(): void {
    try {
      const content = fs.readFileSync(this.cacheFile, 'utf-8');
      const cacheData: CacheFile = JSON.parse(content);

      // Validate cache version
      if (cacheData.version !== this.CACHE_VERSION) {
        this.logger.info('Cache version mismatch, clearing cache');
        this.clearAll();
        return;
      }

      // Load entries into memory cache
      let loadedCount = 0;
      let expiredCount = 0;

      for (const [key, item] of Object.entries(cacheData.entries)) {
        if (this.isExpired(item)) {
          expiredCount++;
          continue;
        }
        this.memoryCache.set(key, item);
        loadedCount++;
      }

      this.logger.debug(`Loaded ${loadedCount} cache entries, skipped ${expiredCount} expired`);
    } catch (error) {
      this.logger.warn(
        'Failed to load cache from file',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Save cache to file
   */
  private saveToFile(): void {
    try {
      // Remove expired entries before saving
      this.cleanupExpired();

      const cacheData: CacheFile = {
        version: this.CACHE_VERSION,
        entries: Object.fromEntries(this.memoryCache),
      };

      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
      this.logger.debug(`Cache saved to file with ${this.memoryCache.size} entries`);
    } catch (error) {
      this.logger.warn('Failed to save cache to file', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Get item from cache
   */
  get<T>(key: string): T | null {
    const item = this.memoryCache.get(key);

    if (!item) {
      this.stats.misses++;
      this.logger.verbose(`Cache miss: ${key}`);
      return null;
    }

    // Check if expired
    if (this.isExpired(item)) {
      this.memoryCache.delete(key);
      this.stats.misses++;
      this.logger.verbose(`Cache expired: ${key}`);
      return null;
    }

    this.stats.hits++;
    this.logger.verbose(`Cache hit: ${key}`);
    return item.data as T;
  }

  /**
   * Set item in cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const item: CachedItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL,
    };

    this.memoryCache.set(key, item);
    this.logger.verbose(`Cache set: ${key} (TTL: ${item.ttl}ms)`);

    // Periodically save to file (not on every set for performance)
    if (this.memoryCache.size % 10 === 0) {
      this.saveToFile();
    }
  }

  /**
   * Check if item is expired
   */
  private isExpired(item: CachedItem<any>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  /**
   * Remove expired entries from memory cache
   */
  private cleanupExpired(): void {
    let removedCount = 0;
    for (const [key, item] of this.memoryCache.entries()) {
      if (this.isExpired(item)) {
        this.memoryCache.delete(key);
        removedCount++;
      }
    }
    if (removedCount > 0) {
      this.logger.debug(`Cleaned up ${removedCount} expired cache entries`);
    }
  }

  /**
   * Delete specific key from cache
   */
  delete(key: string): boolean {
    const deleted = this.memoryCache.delete(key);
    if (deleted) {
      this.logger.verbose(`Cache deleted: ${key}`);
      this.saveToFile();
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    this.memoryCache.clear();
    this.stats = { hits: 0, misses: 0 };

    try {
      if (fs.existsSync(this.cacheFile)) {
        fs.unlinkSync(this.cacheFile);
      }
      this.logger.info('Cache cleared');
    } catch (error) {
      this.logger.warn('Failed to clear cache file', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.memoryCache.size,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
    };
  }

  /**
   * Check if key exists in cache (and not expired)
   */
  has(key: string): boolean {
    const item = this.memoryCache.get(key);
    if (!item) return false;

    if (this.isExpired(item)) {
      this.memoryCache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    this.cleanupExpired();
    return Array.from(this.memoryCache.keys());
  }

  /**
   * Flush cache to file (call before process exit)
   */
  flush(): void {
    this.saveToFile();
    this.logger.debug('Cache flushed to disk');
  }

  /**
   * Get cache file path
   */
  getCacheFilePath(): string {
    return this.cacheFile;
  }

  /**
   * Get cache size in bytes (approximate)
   */
  getSizeInBytes(): number {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const stats = fs.statSync(this.cacheFile);
        return stats.size;
      }
    } catch (error) {
      this.logger.warn('Failed to get cache file size', error instanceof Error ? error : undefined);
    }
    return 0;
  }
}
