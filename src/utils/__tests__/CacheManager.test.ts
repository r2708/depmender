import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheManager } from '../CacheManager';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let testCacheDir: string;

  beforeEach(() => {
    // Create a temporary cache directory for testing
    testCacheDir = path.join(os.tmpdir(), 'depmender-test-cache');
    fs.ensureDirSync(testCacheDir);

    // Get cache manager instance
    cacheManager = CacheManager.getInstance();
  });

  afterEach(() => {
    // Clean up test cache directory
    if (fs.existsSync(testCacheDir)) {
      fs.removeSync(testCacheDir);
    }

    // Clear cache for next test
    cacheManager.clearAll();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve data', () => {
      const testData = { name: 'express', version: '4.18.2' };

      cacheManager.set('test-key', testData);
      const retrieved = cacheManager.get('test-key');

      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent keys', () => {
      const result = cacheManager.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should handle TTL expiration', async () => {
      const testData = { name: 'react', version: '18.2.0' };

      // Set with very short TTL (1ms)
      cacheManager.set('short-ttl-key', testData, 1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = cacheManager.get('short-ttl-key');
      expect(result).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', () => {
      // Initial stats
      const initialStats = cacheManager.getStats();
      expect(initialStats.hits).toBe(0);
      expect(initialStats.misses).toBe(0);

      // Cache miss
      cacheManager.get('non-existent');

      // Cache hit
      cacheManager.set('test', { data: 'value' });
      cacheManager.get('test');

      const finalStats = cacheManager.getStats();
      expect(finalStats.misses).toBeGreaterThan(initialStats.misses);
      expect(finalStats.hits).toBeGreaterThan(initialStats.hits);
    });
  });
});
