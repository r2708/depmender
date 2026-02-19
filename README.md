# DepMender

[![npm version](https://img.shields.io/npm/v/depmender.svg)](https://www.npmjs.com/package/depmender)
[![npm downloads](https://img.shields.io/npm/dm/depmender.svg)](https://www.npmjs.com/package/depmender)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/depmender.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/yourusername/depmender/pulls)

A comprehensive CLI tool that scans JavaScript/TypeScript projects for dependency issues and fixes them automatically. Features advanced diagnostics, unused dependency cleanup, real-time monitoring, and intelligent configuration management.

## What it does

DepMender helps you maintain healthy dependencies with 5 simple commands:
- **check** - Analyze dependencies and system health (replaces scan + doctor)
- **report** - Generate detailed health reports
- **fix** - Fix ALL issues with one command (install-missing, remove-unused, dedupe, sync, resolve, and more)
- **upgrade** - Upgrade all dependencies to their latest versions
- **init** - Initialize configuration file

### Unified Fix Command

Unlike other tools that require multiple commands for different operations, DepMender provides ONE command to handle everything:

```bash
depmender fix --yes
```

This single command replaces all of these standalone operations:
- `install-missing` - Install missing dependencies
- `remove-unused` - Remove unused dependencies
- `dependency-sync` - Sync dependencies
- `version-fix` / `fix-versions` - Fix version mismatches
- `update-deps` - Update outdated packages
- `cleanup` - Clean up broken installations
- `dedupe` - Deduplicate dependencies
- `sort` - Sort dependencies
- `validate` - Validate integrity
- `deep-scan` - Deep scan for issues
- `repair` - Repair broken packages
- `auto-fix` - Auto-fix all issues
- `normalize` - Normalize structure
- `optimize` - Optimize dependency tree
- `sync` - Sync all files
- `resolve` - Resolve conflicts

## Installation

```bash
npm install -g depmender
```

## Quick Start

```bash
# Initialize configuration (optional)
depmender init

# Check project dependencies and system health
depmender check

# Get detailed report
depmender report

# Fix ALL issues with one command
depmender fix --yes

# Upgrade all dependencies to latest versions
depmender upgrade --yes
```

## Commands

### Core Commands

#### `depmender check`
Analyzes your project dependencies and system health (combines scan + doctor functionality).

```bash
depmender check                    # Check current directory
depmender check --path ./frontend  # Check specific directory
depmender check --json            # Get JSON output
depmender check --verbose         # Show detailed information
```

**What it checks:**
- Outdated packages and available updates
- Missing dependencies
- Broken installations
- Security vulnerabilities
- Peer dependency conflicts
- Version mismatches
- Node.js environment and version compatibility
- Project structure (package.json, lockfiles, node_modules)
- Package manager health

#### `depmender report`
Generates detailed health report with issue breakdown.

```bash
depmender report                  # Generate detailed report
depmender report --json          # Export as JSON
depmender report --verbose       # Include extra details
```

#### `depmender fix`
Unified command that automatically fixes all dependency issues with backup creation.

This single command handles all fix operations:
- Install missing dependencies
- Remove unused dependencies  
- Update outdated packages
- Fix version mismatches
- Resolve peer conflicts
- Deduplicate dependencies
- Sync package.json with lockfile
- Repair broken installations
- Normalize and optimize dependency tree

```bash
depmender fix                     # Interactive fix with prompts
depmender fix --yes              # Auto-fix without confirmation
depmender fix --path ./backend   # Fix specific project
```

#### `depmender upgrade`
Upgrade all dependencies to their latest versions.

```bash
depmender upgrade                 # Interactive upgrade with prompts
depmender upgrade --yes          # Auto-upgrade without confirmation
depmender upgrade --path ./api   # Upgrade specific project
```

**Features:**
- Upgrades all outdated packages to latest versions
- Creates automatic backups before changes
- Shows detailed upgrade plan
- Risk assessment for each upgrade
- Safe rollback if issues occur

#### `depmender init`
Initialize depmender configuration file.

```bash
depmender init                    # Create sample config file
depmender init --force           # Overwrite existing config
```

**Creates:** `depmender.config.js` with customizable options:
- Scanning rules (max outdated days, allowed vulnerabilities)
- Auto-fix settings (risk levels, confirmations)
- Output formatting (colors, verbosity)
- Integrations (Slack, GitHub)

### Utility Commands

#### `depmender help`
Shows help information for commands.

```bash
depmender help                   # General help
depmender help check             # Help for specific command
```

#### `depmender examples`
Shows usage examples and workflows.

```bash
depmender examples              # Show usage examples
```

#### `depmender troubleshooting`
Shows troubleshooting guide for common issues.

```bash
depmender troubleshooting       # Show troubleshooting guide
```

## Configuration

Create a `depmender.config.js` file to customize behavior:

```javascript
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
    confirmBeforeFix: true,        // Ask for confirmation
    backupBeforeFix: true,         // Create backup before fixing
    maxRiskLevel: 'medium'         // Only auto-fix low/medium risk
  },
  
  // Output customization
  output: {
    format: 'detailed',            // 'minimal', 'detailed', 'json'
    showSuccessMessages: true,     // Show success messages
    colors: true                   // Enable colored output
  }
};
```

## Global Options

All commands support these global options:

- `-p, --path <path>` - Project path to analyze (default: current directory)
- `--json` - Output results in JSON format
- `--verbose` - Enable verbose output with additional details
- `--quiet` - Suppress all logs except errors

## Workflows

### Daily Development
```bash
# Quick health check
depmender check

# Detailed analysis before deployment
depmender report --verbose

# Fix issues automatically
depmender fix --yes

# Upgrade to latest versions
depmender upgrade --yes
```

### CI/CD Integration
```bash
# Generate JSON report for CI
depmender check --json > dependency-report.json

# Fail build on critical issues
depmender check --json | jq '.healthScore < 50' && exit 1

# Auto-fix in CI (with caution)
depmender fix --yes && npm test
```

### Project Maintenance
```bash
# System health check
depmender check

# Upgrade all dependencies
depmender upgrade --yes

# Verify everything works
npm test
```

## Package Manager Support

- **npm** - Full support with package-lock.json
- **Yarn** - Full support with yarn.lock  
- **pnpm** - Full support with pnpm-lock.yaml

## Features
- **5 Simple Commands** - check, report, fix, upgrade, init - that's all you need
- **Unified Fix Command** - One command (`depmender fix`) replaces 15+ standalone operations
- **Comprehensive Checking** - Detects 6 types of dependency issues plus system health
- **Intelligent Fixing** - Smart suggestions with risk assessment
- **Easy Upgrades** - Upgrade all dependencies with one command
- **Flexible Configuration** - Customize behavior per project
- **Detailed Reporting** - JSON/HTML output for integration
- **Security Focus** - Vulnerability detection and fixing
- **Performance Optimized** - Parallel scanning, caching
- **Lightweight** - Under 500KB package size

## License

MIT


## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Report Bugs** - Open an issue with detailed information
2. **Suggest Features** - Share your ideas for improvements
3. **Submit PRs** - Fix bugs or add new features
4. **Improve Docs** - Help make documentation better
5. **Share Feedback** - Let us know how you're using DepMender

**Made with ❤️ for the JavaScript/TypeScript community**
