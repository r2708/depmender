import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Configuration interface for depmender
 */
export interface DepmenderConfig {
  rules?: {
    maxOutdatedDays?: number;
    allowedVulnerabilities?: string[];
    excludePackages?: string[];
    includeDev?: boolean;
  };
  autoFix?: {
    enabled?: boolean;
    confirmBeforeFix?: boolean;
    backupBeforeFix?: boolean;
    maxRiskLevel?: 'low' | 'medium' | 'high' | 'critical';
  };
  output?: {
    format?: 'minimal' | 'detailed' | 'json';
    showSuccessMessages?: boolean;
    colors?: boolean;
  };
  integrations?: {
    slack?: {
      webhook?: string;
      notifyOnCritical?: boolean;
    };
    github?: {
      createIssues?: boolean;
      assignTo?: string;
    };
  };
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: DepmenderConfig = {
  rules: {
    maxOutdatedDays: 90,
    allowedVulnerabilities: [],
    excludePackages: [],
    includeDev: true
  },
  autoFix: {
    enabled: false,
    confirmBeforeFix: true,
    backupBeforeFix: true,
    maxRiskLevel: 'medium'
  },
  output: {
    format: 'detailed',
    showSuccessMessages: true,
    colors: true
  },
  integrations: {}
};

/**
 * Configuration file names to search for
 */
const CONFIG_FILES = [
  'depmender.config.js',
  'depmender.config.json',
  '.depmenderrc',
  '.depmenderrc.json',
  '.depmenderrc.js'
];

/**
 * Configuration manager class
 */
export class ConfigManager {
  private config: DepmenderConfig;
  private configPath?: string;

  constructor(config: DepmenderConfig = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load configuration from file system
   */
  static async load(projectPath: string, configPath?: string): Promise<ConfigManager> {
    let config = DEFAULT_CONFIG;
    let foundConfigPath: string | undefined;

    if (configPath) {
      // Use specified config file
      const fullPath = path.resolve(projectPath, configPath);
      if (await fs.pathExists(fullPath)) {
        config = await ConfigManager.loadConfigFile(fullPath);
        foundConfigPath = fullPath;
      } else {
        throw new Error(`Config file not found: ${configPath}`);
      }
    } else {
      // Search for config files
      for (const fileName of CONFIG_FILES) {
        const fullPath = path.join(projectPath, fileName);
        if (await fs.pathExists(fullPath)) {
          config = await ConfigManager.loadConfigFile(fullPath);
          foundConfigPath = fullPath;
          break;
        }
      }
    }

    const manager = new ConfigManager(config);
    manager.configPath = foundConfigPath;
    return manager;
  }

  /**
   * Load configuration from a specific file
   */
  private static async loadConfigFile(filePath: string): Promise<DepmenderConfig> {
    const ext = path.extname(filePath);
    
    try {
      if (ext === '.js') {
        // Load JavaScript config
        delete require.cache[require.resolve(filePath)];
        const configModule = require(filePath);
        return configModule.default || configModule;
      } else {
        // Load JSON config
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      throw new Error(`Failed to load config file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): DepmenderConfig {
    return this.config;
  }

  /**
   * Get configuration path if loaded from file
   */
  getConfigPath(): string | undefined {
    return this.configPath;
  }

  /**
   * Check if a package should be excluded
   */
  shouldExcludePackage(packageName: string): boolean {
    const excludePatterns = this.config.rules?.excludePackages || [];
    
    return excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        // Convert glob pattern to regex
        const regexPattern = pattern
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        return new RegExp(`^${regexPattern}$`).test(packageName);
      }
      return packageName === pattern;
    });
  }

  /**
   * Check if a vulnerability severity is allowed
   */
  isVulnerabilityAllowed(severity: string): boolean {
    const allowed = this.config.rules?.allowedVulnerabilities || [];
    return allowed.includes(severity.toLowerCase());
  }

  /**
   * Check if package is too outdated based on config
   */
  isPackageTooOutdated(daysOld: number): boolean {
    const maxDays = this.config.rules?.maxOutdatedDays || 90;
    return daysOld > maxDays;
  }

  /**
   * Should include dev dependencies in scan
   */
  shouldIncludeDevDependencies(): boolean {
    return this.config.rules?.includeDev !== false;
  }

  /**
   * Get auto-fix configuration
   */
  getAutoFixConfig() {
    return this.config.autoFix || DEFAULT_CONFIG.autoFix!;
  }

  /**
   * Get output configuration
   */
  getOutputConfig() {
    return this.config.output || DEFAULT_CONFIG.output!;
  }

  /**
   * Create a sample configuration file
   */
  static async createSampleConfig(projectPath: string): Promise<string> {
    const configPath = path.join(projectPath, 'depmender.config.js');
    
    const sampleConfig = `// Depmender Configuration
module.exports = {
  // Scanning rules
  rules: {
    maxOutdatedDays: 90,           // Allow packages older than 90 days
    allowedVulnerabilities: ['low'], // Ignore low severity vulnerabilities
    excludePackages: [             // Skip these packages
      '@types/*',
      'eslint-*'
    ],
    includeDev: true               // Include devDependencies in scan
  },
  
  // Auto-fix settings
  autoFix: {
    enabled: false,                // Enable automatic fixes
    confirmBeforeFix: true,        // Ask for confirmation before fixing
    backupBeforeFix: true,         // Create backup before fixing
    maxRiskLevel: 'medium'         // Only auto-fix low/medium risk issues
  },
  
  // Output customization
  output: {
    format: 'detailed',            // 'minimal', 'detailed', 'json'
    showSuccessMessages: true,     // Show success messages
    colors: true                   // Enable colored output
  },
  
  // Integration settings (optional)
  integrations: {
    slack: {
      webhook: '',                 // Slack webhook URL
      notifyOnCritical: true       // Notify on critical issues
    },
    github: {
      createIssues: false,         // Create GitHub issues for problems
      assignTo: ''                 // GitHub username to assign issues
    }
  }
};
`;

    await fs.writeFile(configPath, sampleConfig);
    return configPath;
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate rules
    if (this.config.rules) {
      if (this.config.rules.maxOutdatedDays !== undefined && this.config.rules.maxOutdatedDays < 0) {
        errors.push('rules.maxOutdatedDays must be >= 0');
      }

      if (this.config.rules.allowedVulnerabilities) {
        const validSeverities = ['low', 'moderate', 'high', 'critical'];
        for (const severity of this.config.rules.allowedVulnerabilities) {
          if (!validSeverities.includes(severity.toLowerCase())) {
            errors.push(`Invalid vulnerability severity: ${severity}. Must be one of: ${validSeverities.join(', ')}`);
          }
        }
      }
    }

    // Validate autoFix
    if (this.config.autoFix?.maxRiskLevel) {
      const validRiskLevels = ['low', 'medium', 'high', 'critical'];
      if (!validRiskLevels.includes(this.config.autoFix.maxRiskLevel)) {
        errors.push(`Invalid maxRiskLevel: ${this.config.autoFix.maxRiskLevel}. Must be one of: ${validRiskLevels.join(', ')}`);
      }
    }

    // Validate output
    if (this.config.output?.format) {
      const validFormats = ['minimal', 'detailed', 'json'];
      if (!validFormats.includes(this.config.output.format)) {
        errors.push(`Invalid output format: ${this.config.output.format}. Must be one of: ${validFormats.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}