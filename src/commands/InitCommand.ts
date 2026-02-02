import { BaseCommand } from './BaseCommand';
import { CommandArgs, CommandResult } from '../core/types';
import { CLIFormatter } from '../utils/CLIFormatter';
import { ConfigManager } from '../core/config';
import { logger } from '../utils/Logger';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Init command - initialize depmender configuration
 */
export class InitCommand extends BaseCommand {
  name = 'init';
  description = 'Initialize depmender configuration file';
  private logger = logger.child('InitCommand');

  async execute(args: CommandArgs): Promise<CommandResult> {
    this.logger.info('Starting init command execution');
    
    try {
      console.log(CLIFormatter.header('🚀 INITIALIZING DEPMENDER'));
      console.log('');

      const configPath = await this.createConfiguration(args.projectPath, args.options);
      const output = this.formatInitResults(configPath);
      
      console.log(output);
      
      return this.createSuccessResult(output);
      
    } catch (error) {
      this.logger.error('Init command failed', error instanceof Error ? error : undefined);
      return this.handleError(error, 'Configuration initialization');
    }
  }

  /**
   * Create configuration file
   */
  private async createConfiguration(projectPath: string, options: any): Promise<string> {
    // Check if config already exists
    const existingConfig = await this.findExistingConfig(projectPath);
    
    if (existingConfig && !options.force) {
      throw new Error(`Configuration file already exists: ${existingConfig}\nUse --force to overwrite`);
    }

    // Create sample configuration
    const configPath = await ConfigManager.createSampleConfig(projectPath);
    
    return configPath;
  }

  /**
   * Find existing configuration file
   */
  private async findExistingConfig(projectPath: string): Promise<string | null> {
    const configFiles = [
      'depmender.config.js',
      'depmender.config.json',
      '.depmenderrc',
      '.depmenderrc.json',
      '.depmenderrc.js'
    ];

    for (const fileName of configFiles) {
      const filePath = path.join(projectPath, fileName);
      if (await fs.pathExists(filePath)) {
        return fileName;
      }
    }

    return null;
  }

  /**
   * Format initialization results
   */
  private formatInitResults(configPath: string): string {
    const lines: string[] = [];
    
    lines.push('✅ Configuration file created successfully!');
    lines.push('');
    lines.push(`📄 Config file: ${path.basename(configPath)}`);
    lines.push('');
    lines.push('🎯 What you can configure:');
    lines.push('   • Scanning rules (outdated packages, vulnerabilities)');
    lines.push('   • Auto-fix settings (risk levels, confirmations)');
    lines.push('   • Output formatting (colors, verbosity)');
    lines.push('   • Integrations (Slack, GitHub)');
    lines.push('');
    lines.push('💡 Next steps:');
    lines.push('   1. Edit the configuration file to match your needs');
    lines.push('   2. Run `depmender scan` to test your configuration');
    lines.push('   3. Use `depmender doctor` for system diagnostics');
    lines.push('');
    lines.push('📚 Learn more: https://github.com/your-repo/depmender#configuration');

    return lines.join('\n');
  }
}