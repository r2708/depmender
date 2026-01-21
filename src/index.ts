// Main entry point for the DepMender library

// Export the main class (not the interface)
export { DependencyAnalyzer } from './core/DependencyAnalyzer';

// Export all types except conflicting interfaces
export * from './core/types';

// Export scanner implementations
export * from './scanners';

// Export reporter implementations (not interfaces)
export { HealthReporter } from './reporters/HealthReporter';

// Export fixer implementations (not interfaces)
export { SuggestionEngine } from './fixers/SuggestionEngine';
export { AutoFixer } from './fixers/AutoFixer';
export { ConflictResolver } from './fixers/ConflictResolver';

// Export adapter implementations
export * from './adapters';