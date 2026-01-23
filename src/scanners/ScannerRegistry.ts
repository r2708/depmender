import { DependencyScanner, ScannerType, ScanContext, ScanResult } from '../core/types';

/**
 * Registry for managing dependency scanners
 * Allows registration and execution of different scanner types
 */
export class ScannerRegistry {
  private scanners: Map<ScannerType, DependencyScanner> = new Map();

  /**
   * Registers a scanner with the registry
   */
  register(scanner: DependencyScanner): void {
    const scannerType = scanner.getScannerType();
    
    if (this.scanners.has(scannerType)) {
      throw new Error(`Scanner of type ${scannerType} is already registered`);
    }
    
    this.scanners.set(scannerType, scanner);
  }

  /**
   * Unregisters a scanner from the registry
   */
  unregister(scannerType: ScannerType): boolean {
    return this.scanners.delete(scannerType);
  }

  /**
   * Gets a scanner by type
   */
  getScanner(scannerType: ScannerType): DependencyScanner | undefined {
    return this.scanners.get(scannerType);
  }

  /**
   * Gets all registered scanner types
   */
  getRegisteredTypes(): ScannerType[] {
    return Array.from(this.scanners.keys());
  }

  /**
   * Gets all registered scanners
   */
  getAllScanners(): DependencyScanner[] {
    return Array.from(this.scanners.values());
  }

  /**
   * Checks if a scanner type is registered
   */
  isRegistered(scannerType: ScannerType): boolean {
    return this.scanners.has(scannerType);
  }

  /**
   * Runs a specific scanner
   */
  async runScanner(scannerType: ScannerType, context: ScanContext): Promise<ScanResult> {
    const scanner = this.getScanner(scannerType);
    
    if (!scanner) {
      throw new Error(`Scanner of type ${scannerType} is not registered`);
    }
    
    return scanner.scan(context);
  }

  /**
   * Runs all registered scanners in parallel for better performance
   */
  async runAllScanners(context: ScanContext): Promise<ScanResult[]> {
    const scanners = this.getAllScanners();
    
    // Run all scanners in parallel
    const scanPromises = scanners.map(async (scanner) => {
      try {
        return await scanner.scan(context);
      } catch (error) {
        console.warn(`Scanner ${scanner.getScannerType()} failed:`, error);
        // Return empty result for failed scanners
        return {
          scannerType: scanner.getScannerType(),
          issues: [],
          securityIssues: []
        } as ScanResult;
      }
    });
    
    const results = await Promise.all(scanPromises);
    
    // Filter out empty results from failed scanners
    return results.filter(result => result.issues.length > 0 || (result.securityIssues && result.securityIssues.length > 0));
  }

  /**
   * Runs scanners of specific types in parallel
   */
  async runScanners(scannerTypes: ScannerType[], context: ScanContext): Promise<ScanResult[]> {
    // Run specified scanners in parallel
    const scanPromises = scannerTypes.map(async (scannerType) => {
      try {
        return await this.runScanner(scannerType, context);
      } catch (error) {
        console.warn(`Scanner ${scannerType} failed:`, error);
        // Return empty result for failed scanners
        return {
          scannerType,
          issues: [],
          securityIssues: []
        } as ScanResult;
      }
    });
    
    const results = await Promise.all(scanPromises);
    
    // Filter out empty results from failed scanners
    return results.filter(result => result.issues.length > 0 || (result.securityIssues && result.securityIssues.length > 0));
  }

  /**
   * Clears all registered scanners
   */
  clear(): void {
    this.scanners.clear();
  }

  /**
   * Gets the count of registered scanners
   */
  getCount(): number {
    return this.scanners.size;
  }

  /**
   * Creates a default registry with common scanners
   * Note: Actual scanner implementations will be added in subsequent tasks
   */
  static createDefault(): ScannerRegistry {
    const registry = new ScannerRegistry();
    
    // Scanners will be registered here as they are implemented
    // registry.register(new OutdatedScanner());
    // registry.register(new MissingScanner());
    // registry.register(new BrokenScanner());
    // registry.register(new PeerConflictScanner());
    // registry.register(new VersionMismatchScanner());
    // registry.register(new SecurityScanner());
    
    return registry;
  }
}