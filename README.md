# DepMender

[![npm version](https://img.shields.io/npm/v/depmender.svg)](https://www.npmjs.com/package/depmender)
[![npm downloads](https://img.shields.io/npm/dm/depmender.svg)](https://www.npmjs.com/package/depmender)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/depmender.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/yourusername/depmender/pulls)

A comprehensive CLI tool that scans JavaScript/TypeScript projects for dependency issues and fixes them automatically. Features advanced diagnostics, unused dependency cleanup, real-time monitoring, and intelligent configuration management.

## 📑 Table of Contents

- [What it does](#what-it-does)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [Core Commands](#core-commands)
  - [Advanced Commands](#advanced-commands)
  - [Utility Commands](#utility-commands)
- [Configuration](#configuration)
- [Global Options](#global-options)
- [Workflows](#workflows)
- [Package Manager Support](#package-manager-support)
- [Features](#features)
- [Contributing](#contributing)
- [License](#license)

## What it does

DepMender helps you maintain healthy dependencies by:
- **Scanning** for outdated packages, broken installations, and security vulnerabilities
- **Fixing** issues automatically with intelligent suggestions
- **Diagnosing** system health and project structure
- **Cleaning** unused dependencies to reduce bundle size
- **Monitoring** changes in real-time with watch mode
- **Configuring** behavior with flexible configuration files

## Installation

```bash
npm install -g depmender
```

## Quick Start

```bash
# Initialize configuration (optional)
depmender init

# Run system health check
depmender doctor

# Scan for dependency issues
depmender scan

# Get detailed report
depmender report

# Fix issues automatically
depmender fix --yes

# Clean unused dependencies
depmender clean --dry-run

# Monitor project in real-time
depmender watch
```

## Commands

### Core Commands

#### `depmender scan`
Analyzes your project dependencies and shows health overview.

```bash
depmender scan                    # Scan current directory
depmender scan --path ./frontend  # Scan specific directory
depmender scan --json            # Get JSON output
depmender scan --verbose         # Show detailed information
```

#### `depmender report`
Generates detailed health report with issue breakdown.

```bash
depmender report                  # Generate detailed report
depmender report --json          # Export as JSON
depmender report --verbose       # Include extra details
```

#### `depmender fix`
Automatically fixes detected issues with backup creation.

```bash
depmender fix                     # Interactive fix with prompts
depmender fix --yes              # Auto-fix without confirmation
depmender fix --path ./backend   # Fix specific project
```

### Advanced Commands

#### `depmender doctor`
Run comprehensive system health diagnostics.

```bash
depmender doctor                  # Full system health check
```

**What it checks:**
- Node.js environment and version compatibility
- Project structure (package.json, lockfiles, node_modules)
- Package manager health and configuration
- Dependency analysis (duplicates, large packages)
- Performance metrics (install time, disk usage)
- Security audit results
- Personalized recommendations

#### `depmender clean`
Find and remove unused dependencies to reduce bundle size.

```bash
depmender clean --dry-run         # Preview what would be removed (default)
depmender clean --confirm         # Actually remove unused packages
```

**Features:**
- Scans source code for actual imports/requires
- Protects essential dependencies (build tools, linters)
- Shows potential space savings
- Safe removal with dependency analysis

#### `depmender watch`
Monitor project files and run dependency checks automatically.

```bash
depmender watch                   # Start monitoring current directory
depmender watch --notify          # Enable desktop notifications
depmender watch --webhook URL     # Send results to webhook
depmender watch --interval 30s    # Custom scan interval
depmender watch --auto-fix        # Automatically fix issues
```

**Features:**
- Real-time file monitoring (package.json, lockfiles)
- Automatic scans on changes
- Desktop notifications for critical issues
- Webhook integration for CI/CD
- Optional auto-fixing

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
depmender help scan              # Help for specific command
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
depmender scan

# Detailed analysis before deployment
depmender report --verbose

# Fix issues automatically
depmender fix --yes
```

### CI/CD Integration
```bash
# Generate JSON report for CI
depmender scan --json > dependency-report.json

# Fail build on critical issues
depmender doctor && depmender scan --json | jq '.healthScore < 50' && exit 1

# Auto-fix in CI (with caution)
depmender fix --yes && npm test
```

### Project Maintenance
```bash
# System health check
depmender doctor

# Clean unused dependencies
depmender clean --confirm

# Monitor for changes
depmender watch --notify
```

## Package Manager Support

- **npm** - Full support with package-lock.json
- **Yarn** - Full support with yarn.lock  
- **pnpm** - Full support with pnpm-lock.yaml

## Features
- **Comprehensive Scanning** - Detects 6 types of dependency issues
- **Intelligent Fixing** - Smart suggestions with risk assessment
- **System Diagnostics** - Complete health check for your environment
- **Dependency Cleanup** - Remove unused packages safely
- **Real-time Monitoring** - Watch mode with notifications
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

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/depmender.git
cd depmender

# Install dependencies
npm install

# Build the project
npm run build

# Run locally
node dist/cli.js --help
```

### Running Tests

```bash
npm test
```

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

## 🙏 Acknowledgments

Built with ❤️ using TypeScript, Commander.js, and Chalk.

Special thanks to all contributors and the open-source community.

## 📧 Support

- 📖 [Documentation](https://github.com/yourusername/depmender#readme)
- 🐛 [Issue Tracker](https://github.com/yourusername/depmender/issues)
- 💬 [Discussions](https://github.com/yourusername/depmender/discussions)
- 📧 Email: support@depmender.dev

---

**Made with ❤️ for the JavaScript/TypeScript community**
