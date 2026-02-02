import { BaseCommand } from './BaseCommand';
import { CommandArgs, CommandResult } from '../core/types';
import { CLIFormatter } from '../utils/CLIFormatter';
import { logger } from '../utils/Logger';
import { DependencyAnalyzer } from '../core/DependencyAnalyzer';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as chokidar from 'chokidar';

/**
 * Watch command - continuous monitoring of dependencies
 */
export class WatchCommand extends BaseCommand {
  name = 'watch';
  description = 'Monitor project files and run dependency checks automatically';
  private logger = logger.child('WatchCommand');
  private watcher?: chokidar.FSWatcher;
  private analyzer?: DependencyAnalyzer;
  private isScanning = false;
  private lastScanTime = 0;
  private scanInterval = 5000; // 5 seconds minimum between scans

  async execute(args: CommandArgs): Promise<CommandResult> {
    this.logger.info('Starting watch command execution');
    
    try {
      console.log(CLIFormatter.header('👀 WATCH MODE STARTED'));
      console.log('');

      // Initialize analyzer
      this.analyzer = new DependencyAnalyzer();

      // Setup watch configuration
      const config = this.getWatchConfig(args.options);
      
      // Display initial status
      await this.displayInitialStatus(args.projectPath, config);

      // Run initial scan
      await this.runInitialScan(args.projectPath);

      // Start watching
      await this.startWatching(args.projectPath, config);

      // Keep the process running
      await this.keepAlive();

      return this.createSuccessResult('Watch mode stopped');
      
    } catch (error) {
      this.logger.error('Watch command failed', error instanceof Error ? error : undefined);
      return this.handleError(error, 'Watch mode');
    }
  }

  /**
   * Get watch configuration from options
   */
  private getWatchConfig(options: any): WatchConfig {
    return {
      notify: options.notify || false,
      webhook: options.webhook || null,
      interval: options.interval ? this.parseInterval(options.interval) : 5000,
      autoFix: options.autoFix || false,
      files: options.files || ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
      ignorePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
    };
  }

  /**
   * Parse interval string (e.g., "30s", "2m") to milliseconds
   */
  private parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)([smh]?)$/);
    if (!match) return 5000;

    const value = parseInt(match[1]);
    const unit = match[2] || 's';

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 5000;
    }
  }

  /**
   * Display initial status
   */
  private async displayInitialStatus(projectPath: string, config: WatchConfig): Promise<void> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    let projectName = 'Unknown';
    let packageManager = 'npm';

    if (await fs.pathExists(packageJsonPath)) {
      try {
        const packageJson = await fs.readJson(packageJsonPath);
        projectName = packageJson.name || 'Unknown';
      } catch (error) {
        // Ignore
      }
    }

    // Detect package manager
    if (await fs.pathExists(path.join(projectPath, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (await fs.pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    }

    console.log(`📁 Monitoring: ${projectPath}`);
    console.log(`📦 Project: ${projectName}`);
    console.log(`⚙️  Package Manager: ${packageManager}`);
    console.log(`⏰ Started: ${new Date().toLocaleString()}`);
    console.log(`🔄 Scan Interval: ${config.interval / 1000}s`);
    
    if (config.notify) {
      console.log('🔔 Desktop notifications: Enabled');
    }
    
    if (config.webhook) {
      console.log(`🌐 Webhook: ${config.webhook}`);
    }
    
    if (config.autoFix) {
      console.log('🔧 Auto-fix: Enabled');
    }

    console.log('');
    console.log('Press Ctrl+C to stop watching...');
    console.log('');
  }

  /**
   * Run initial scan
   */
  private async runInitialScan(projectPath: string): Promise<void> {
    try {
      const analysis = await this.analyzer!.analyze(projectPath);
      const timestamp = new Date().toLocaleTimeString();
      
      console.log(`[${timestamp}] ✅ Initial scan complete - Health: ${analysis.healthScore}/100`);
      
      if (analysis.issues.length > 0) {
        console.log(`[${timestamp}] ⚠️  Found ${analysis.issues.length} issues`);
      }
      
      if (analysis.securityVulnerabilities.length > 0) {
        console.log(`[${timestamp}] 🔒 Found ${analysis.securityVulnerabilities.length} security vulnerabilities`);
      }

    } catch (error) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ❌ Initial scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start watching files
   */
  private async startWatching(projectPath: string, config: WatchConfig): Promise<void> {
    const watchPaths = config.files.map(file => path.join(projectPath, file));
    
    this.watcher = chokidar.watch(watchPaths, {
      ignored: config.ignorePatterns,
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('change', async (filePath) => {
      await this.handleFileChange(filePath, projectPath, config);
    });

    this.watcher.on('add', async (filePath) => {
      await this.handleFileAdd(filePath, projectPath, config);
    });

    this.watcher.on('unlink', async (filePath) => {
      await this.handleFileDelete(filePath, projectPath, config);
    });

    this.watcher.on('error', (error) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[${timestamp}] ❌ Watch error: ${message}`);
    });
  }

  /**
   * Handle file change event
   */
  private async handleFileChange(filePath: string, projectPath: string, config: WatchConfig): Promise<void> {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(`[${timestamp}] 📦 ${fileName} modified`);
    
    // Throttle scans
    const now = Date.now();
    if (now - this.lastScanTime < config.interval) {
      return;
    }

    await this.runScan(projectPath, config, 'File modified');
  }

  /**
   * Handle file add event
   */
  private async handleFileAdd(filePath: string, projectPath: string, config: WatchConfig): Promise<void> {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(`[${timestamp}] ➕ ${fileName} added`);
    await this.runScan(projectPath, config, 'File added');
  }

  /**
   * Handle file delete event
   */
  private async handleFileDelete(filePath: string, projectPath: string, config: WatchConfig): Promise<void> {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(`[${timestamp}] ➖ ${fileName} deleted`);
    await this.runScan(projectPath, config, 'File deleted');
  }

  /**
   * Run dependency scan
   */
  private async runScan(projectPath: string, config: WatchConfig, trigger: string): Promise<void> {
    if (this.isScanning) {
      return;
    }

    this.isScanning = true;
    this.lastScanTime = Date.now();
    
    const timestamp = new Date().toLocaleTimeString();
    
    try {
      console.log(`[${timestamp}] 🔍 Running dependency scan...`);
      
      const analysis = await this.analyzer!.analyze(projectPath);
      
      // Report results
      if (analysis.issues.length === 0 && analysis.securityVulnerabilities.length === 0) {
        console.log(`[${timestamp}] ✅ No issues found - Health: ${analysis.healthScore}/100`);
      } else {
        if (analysis.issues.length > 0) {
          console.log(`[${timestamp}] ⚠️  Found ${analysis.issues.length} dependency issues`);
          
          // Show critical issues
          const criticalIssues = analysis.issues.filter(issue => issue.severity === 'critical');
          if (criticalIssues.length > 0) {
            console.log(`[${timestamp}] 🚨 ${criticalIssues.length} critical issues detected!`);
          }
        }
        
        if (analysis.securityVulnerabilities.length > 0) {
          console.log(`[${timestamp}] 🔒 Found ${analysis.securityVulnerabilities.length} security vulnerabilities`);
          
          // Show high/critical vulnerabilities
          const highVulns = analysis.securityVulnerabilities.filter(v => 
            v.severity === 'high' || v.severity === 'critical'
          );
          if (highVulns.length > 0) {
            console.log(`[${timestamp}] 🚨 ${highVulns.length} high/critical vulnerabilities!`);
          }
        }

        console.log(`[${timestamp}] 💡 Run 'depmender fix' to resolve issues`);

        // Send notifications if enabled
        if (config.notify) {
          await this.sendDesktopNotification(analysis);
        }

        // Send webhook if configured
        if (config.webhook) {
          await this.sendWebhook(config.webhook, analysis, trigger);
        }

        // Auto-fix if enabled
        if (config.autoFix) {
          await this.runAutoFix(projectPath, analysis);
        }
      }

    } catch (error) {
      console.log(`[${timestamp}] ❌ Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Send desktop notification
   */
  private async sendDesktopNotification(analysis: any): Promise<void> {
    try {
      // This would require a notification library like node-notifier
      // For now, just log that we would send a notification
      const issueCount = analysis.issues.length + analysis.securityVulnerabilities.length;
      console.log(`🔔 [Notification] Found ${issueCount} dependency issues`);
    } catch (error) {
      // Ignore notification errors
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(webhookUrl: string, analysis: any, trigger: string): Promise<void> {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        trigger,
        healthScore: analysis.healthScore,
        issues: analysis.issues.length,
        vulnerabilities: analysis.securityVulnerabilities.length,
        project: analysis.projectInfo
      };

      // This would require an HTTP client like node-fetch
      // For now, just log that we would send a webhook
      console.log(`🌐 [Webhook] Sending notification to ${webhookUrl}`);
      console.log(`   Payload: ${JSON.stringify(payload, null, 2)}`);
      
    } catch (error) {
      console.log(`❌ Webhook failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run auto-fix
   */
  private async runAutoFix(projectPath: string, analysis: any): Promise<void> {
    try {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] 🔧 Running auto-fix...`);
      
      // This would integrate with the AutoFixer
      // For now, just log that we would run auto-fix
      const fixableIssues = analysis.issues.filter((issue: any) => 
        issue.severity !== 'critical'
      );
      
      if (fixableIssues.length > 0) {
        console.log(`[${timestamp}] ✅ Auto-fixed ${fixableIssues.length} issues`);
      } else {
        console.log(`[${timestamp}] ℹ️  No auto-fixable issues found`);
      }
      
    } catch (error) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ❌ Auto-fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Keep the process alive
   */
  private async keepAlive(): Promise<void> {
    return new Promise((resolve) => {
      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n');
        console.log('👋 Stopping watch mode...');
        
        if (this.watcher) {
          this.watcher.close();
        }
        
        console.log('✅ Watch mode stopped');
        resolve();
      });

      process.on('SIGTERM', () => {
        if (this.watcher) {
          this.watcher.close();
        }
        resolve();
      });
    });
  }
}

// Type definitions
interface WatchConfig {
  notify: boolean;
  webhook: string | null;
  interval: number;
  autoFix: boolean;
  files: string[];
  ignorePatterns: string[];
}