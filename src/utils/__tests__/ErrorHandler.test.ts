import { describe, it, expect } from 'vitest';
import { ErrorHandler, ErrorCategory } from '../ErrorHandler';

describe('ErrorHandler', () => {
  const errorHandler = ErrorHandler.getInstance();

  describe('Error Categorization', () => {
    it('should categorize file system errors', () => {
      const error = new Error("ENOENT: no such file or directory, open 'package.json'");
      const errorInfo = errorHandler.analyzeError(error, 'test');

      expect(errorInfo.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(errorInfo.suggestions).toContain('✓ Run this command in your project root directory');
    });

    it('should categorize network errors', () => {
      const error = new Error('ENOTFOUND registry.npmjs.org');
      const errorInfo = errorHandler.analyzeError(error, 'test');

      expect(errorInfo.category).toBe(ErrorCategory.NETWORK);
      expect(errorInfo.suggestions.some(s => s.includes('internet connection'))).toBe(true);
    });

    it('should categorize permission errors', () => {
      const error = new Error("EACCES: permission denied, mkdir '/usr/local/lib'");
      const errorInfo = errorHandler.analyzeError(error, 'test');

      expect(errorInfo.category).toBe(ErrorCategory.PERMISSION);
      expect(errorInfo.suggestions.some(s => s.includes('permissions'))).toBe(true);
    });
  });

  describe('Error Formatting', () => {
    it('should format errors with suggestions', () => {
      const error = new Error('package.json not found');
      const errorInfo = errorHandler.analyzeError(error, 'test');
      const formatted = errorHandler.formatError(errorInfo);

      expect(formatted).toContain('❌ Error:');
      expect(formatted).toContain('💡 How to fix:');
      expect(formatted).toContain('package.json');
    });

    it('should include quick fix commands when available', () => {
      const error = new Error('ENOENT: package.json not found');
      const errorInfo = errorHandler.analyzeError(error, 'test');
      const formatted = errorHandler.formatError(errorInfo);

      expect(formatted).toContain('⚡ Quick fix:');
    });
  });

  describe('Recovery Assessment', () => {
    it('should mark network errors as recoverable', () => {
      const error = new Error('ENOTFOUND registry.npmjs.org');
      const errorInfo = errorHandler.analyzeError(error, 'test');

      expect(errorInfo.recoverable).toBe(true);
    });

    it('should mark unknown errors as non-recoverable', () => {
      const error = new Error('Some unknown error');
      const errorInfo = errorHandler.analyzeError(error, 'test');

      expect(errorInfo.recoverable).toBe(false);
    });
  });
});
