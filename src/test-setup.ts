// Jest test setup file
// Configure fast-check for property-based testing
import fc from 'fast-check';

// Set global configuration for fast-check
fc.configureGlobal({
  numRuns: 100, // Minimum 100 iterations per property test as specified in design
  verbose: true,
  seed: 42, // For reproducible tests
});

// Global test timeout
jest.setTimeout(30000);