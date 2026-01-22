# DepMender

A powerful CLI tool that scans JavaScript/TypeScript projects for dependency issues and automatically fixes them. Keep your dependencies healthy, secure, and up-to-date with intelligent analysis and automated fixes.

## 🚀 What DepMender Does

DepMender helps you maintain healthy dependencies by:

- **🔍 Scanning** your project for dependency issues
- **📊 Analyzing** package health with detailed reports  
- **🔧 Fixing** issues automatically with smart suggestions
- **🛡️ Securing** your project by detecting vulnerabilities
- **⚡ Optimizing** dependency management across npm, yarn, and pnpm

## ✨ Key Features

- **🔍 Smart Dependency Scanner**: Detects outdated, missing, broken, and conflicting dependencies
- **📈 Health Score System**: Get a comprehensive health score (0-100) for your project
- **🤖 Intelligent Auto-Fix**: Automated fixes with backup creation and risk assessment
- **🛡️ Security Analysis**: Vulnerability detection with severity prioritization
- **📦 Multi-Package Manager**: Full support for npm, yarn, and pnpm
- **📊 Detailed Reports**: Rich CLI output with actionable insights
- **🔄 Safe Operations**: Automatic backups before making changes
- **⚡ Fast Performance**: Efficient scanning and fixing processes

## 📦 Installation

```bash
# Install globally via npm
npm install -g depmender

# Or using yarn
yarn global add depmender

# Or using pnpm
pnpm add -g depmender
```

## 🛠️ Commands

### `depmender scan`

```bash
depmender scan                    # Scan current directory
depmender scan --path ./frontend  # Scan specific directory
depmender scan --json            # Get machine-readable output
depmender scan --verbose         # Show detailed logs
```

**What it detects:**
- 📅 Outdated packages
- 💥 Broken installations  
- ❓ Missing dependencies
- 🔗 Peer dependency conflicts
- ⚠️ Version mismatches
- 🔒 Security vulnerabilities

## 🔧 Common Workflows

### Basic Health Check
```bash
# Quick health check
depmender scan

# Get detailed analysis
depmender report

# Apply safe fixes
depmender fix
```

### CI/CD Integration
```bash
# Check dependencies in CI
depmender scan --json > dependency-report.json

# Auto-fix in development (with caution)
depmender fix --yes && npm test
```

### Monorepo Usage
```bash
# Analyze specific packages
depmender scan --path ./packages/frontend
depmender scan --path ./packages/backend

# Fix all packages
for dir in packages/*/; do depmender fix --path "$dir" --yes; done
```

## 📝 License
MIT License - see LICENSE file for details.