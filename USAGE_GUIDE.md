# DepMender Usage Guide

DepMender is a comprehensive CLI tool for analyzing, reporting, and fixing dependency issues in JavaScript/TypeScript projects. It supports npm, yarn, and pnpm package managers.

## 5 Simple Commands

DepMender provides just 5 commands you need to know:

1. **check** - Analyze dependencies and system health
2. **report** - Generate detailed health reports
3. **fix** - Fix all dependency issues
4. **upgrade** - Upgrade all dependencies to latest versions
5. **init** - Initialize configuration file

## Installation & Setup

### Prerequisites
- Node.js (version 14 or higher)
- npm, yarn, or pnpm installed

### Build the Project
```bash
# Clone or download the project
cd depmender

# Install dependencies
npm install

# Build the project
npm run build
```

## Basic Commands

### 1. Check Command
Analyze your project's dependencies and system health (combines scan + doctor functionality).

```bash
# Check current directory
node dist/cli.js check

# Check specific project
node dist/cli.js check --path ./my-project

# Check with JSON output
node dist/cli.js check --json

# Check with verbose output
node dist/cli.js check --verbose

# Check specific project with full path
node dist/cli.js check --path /full/path/to/project
```

**Example Output:**
```
============================================================
🔍 DEPENDENCY CHECK RESULTS
============================================================

📦 Project: my-app v1.0.0
📁 Path: /path/to/my-app
⚙️  Package Manager: npm

🏥 Health Score: 75/100 🟡 Good

📊 Issues Found: 5 issues

📋 Issue Breakdown
------------------------------
  📅 Outdated packages: 3 
  ❓ Missing packages: 1 
  🔒 Security issues: 1 

💡 Next Steps
------------------------------
  • Run `depmender report` for detailed analysis
  • Run `depmender fix` to apply automated fixes
```

### 2. Report Command
Generate detailed dependency health reports with comprehensive analysis.

```bash
# Generate detailed report for current directory
node dist/cli.js report

# Generate report for specific project
node dist/cli.js report --path ./my-project

# Generate JSON report
node dist/cli.js report --json

# Generate verbose report
node dist/cli.js report --verbose

# Save report to file
node dist/cli.js report --json > dependency-report.json
```

**Example Output:**
```
============================================================
📊 DEPENDENCY HEALTH REPORT
============================================================

🏥 Overall Health Score: 75/100 🟡 Good

📋 SUMMARY
--------------------
Total Packages: 150
Issues Found: 5
Critical Issues: 2
Security Vulnerabilities: 1

🚨 CRITICAL ISSUES - IMMEDIATE ATTENTION REQUIRED
--------------------------------------------------

📦 OUTDATED PACKAGES
-------------------------
📦 lodash
   Current: 4.17.20
   Latest:  4.17.21
   Risk: Security vulnerability fixed in latest version

📦 express
   Current: 4.17.1
   Latest:  4.18.2
   Risk: Multiple security fixes available

🔒 SECURITY VULNERABILITIES
---------------------------
🚨 lodash@4.17.20
   Severity: High
   CVSS: 7.5
   Issue: Prototype Pollution
   Fix: Update to 4.17.21+

💡 RECOMMENDATIONS
-------------------------
⚠️ HIGH PRIORITY
  • Update 2 packages with security vulnerabilities
  • Install 1 missing packages

🔧 MEDIUM PRIORITY  
  • Update 3 outdated packages
  • Review peer dependency conflicts
```

### 3. Fix Command
Unified command that automatically fixes all dependency issues.

This single command handles all fix operations including:
- **install-missing** - Install missing dependencies
- **remove-unused** - Remove unused dependencies
- **update-deps** - Update outdated packages
- **version-fix/fix-versions** - Fix version mismatches
- **dependency-sync/sync** - Sync package.json with lockfile
- **cleanup** - Clean up broken installations
- **dedupe** - Deduplicate dependencies
- **sort** - Sort dependencies
- **validate** - Validate dependency integrity
- **deep-scan** - Deep scan for issues
- **repair** - Repair broken packages
- **auto-fix** - Automatically fix all issues
- **normalize** - Normalize dependency structure
- **optimize** - Optimize dependency tree
- **resolve** - Resolve conflicts

```bash
# Fix issues in current directory
node dist/cli.js fix

# Fix issues in specific project
node dist/cli.js fix --path ./my-project

# Auto-confirm all fixes (no prompts)
node dist/cli.js fix --yes

# Fix with verbose output
node dist/cli.js fix --verbose
```

**Example Output:**
```
✅ FIXES APPLIED SUCCESSFULLY
===================================

💾 Backup created: /path/to/project/package.json.backup

📦 Applied 3 fixes:
  1. Updated lodash: 4.17.20 → 4.17.21
  2. Updated express: 4.17.1 → 4.18.2
  3. Installed missing package: @types/node

🎉 Next Steps:
  • Test your application to ensure everything works
  • Run `depmender check` to verify all issues are resolved
  • Consider running your test suite
```

### 4. Upgrade Command
Upgrade all dependencies to their latest versions.

```bash
# Upgrade dependencies in current directory
node dist/cli.js upgrade

# Upgrade dependencies in specific project
node dist/cli.js upgrade --path ./my-project

# Auto-confirm all upgrades (no prompts)
node dist/cli.js upgrade --yes

# Upgrade with verbose output
node dist/cli.js upgrade --verbose
```

**Example Output:**
```
✅ UPGRADES APPLIED SUCCESSFULLY
=====================================

💾 Backup created: /path/to/project/package.json.backup

📦 Upgraded 5 packages:
  1. react: 17.0.2 → 18.2.0
  2. typescript: 4.9.5 → 5.2.2
  3. eslint: 8.45.0 → 8.52.0
  4. webpack: 5.88.0 → 5.89.0
  5. jest: 29.5.0 → 29.7.0

🎉 Next Steps:
  • Test your application to ensure everything works
  • Run your test suite
  • Run `depmender check` to verify all packages are healthy
```

## Advanced Usage

### Help Commands
```bash
# General help
node dist/cli.js help

# Command-specific help
node dist/cli.js help check
node dist/cli.js help report
node dist/cli.js help fix
node dist/cli.js help upgrade

# Usage examples
node dist/cli.js examples

# Troubleshooting guide
node dist/cli.js troubleshooting
```

### Global Options
All commands support these options:

- `--path <path>` - Specify project directory (default: current directory)
- `--json` - Output results in JSON format
- `--verbose` - Enable detailed logging and output
- `--help` - Show command help
- `--version` - Show version number

### Fix Command Options
- `--yes` or `-y` - Automatically confirm all fixes without prompting

## Common Workflows

### 1. Quick Health Check
```bash
# Get a quick overview of your project's dependency health
node dist/cli.js check
```

### 2. Detailed Analysis
```bash
# Get comprehensive analysis and recommendations
node dist/cli.js report --verbose
```

### 3. Automated Fixing
```bash
# Automatically fix all detected issues
node dist/cli.js fix --yes
```

### 4. Upgrade All Dependencies
```bash
# Upgrade all packages to latest versions
node dist/cli.js upgrade --yes
```

### 5. CI/CD Integration
```bash
# Generate JSON report for automated processing
node dist/cli.js check --json > check-results.json

# Check if project has critical issues (exit code indicates status)
node dist/cli.js check --json | jq '.issues[] | select(.severity == "critical")' | wc -l
```

### 6. Multiple Projects
```bash
# Analyze multiple projects
for dir in project1 project2 project3; do
  echo "Analyzing $dir..."
  node dist/cli.js check --path ./$dir
done
```

## Package Manager Support

DepMender automatically detects and works with:

### NPM Projects
```bash
# Works with package-lock.json
node dist/cli.js scan --path ./npm-project
```

### Yarn Projects
```bash
# Works with yarn.lock
node dist/cli.js scan --path ./yarn-project
```

### PNPM Projects
```bash
# Works with pnpm-lock.yaml
node dist/cli.js scan --path ./pnpm-project
```

## Output Formats

### Human-Readable (Default)
- Colorized output with emojis
- Clear sections and formatting
- Progress indicators
- Actionable recommendations

### JSON Format
```bash
# Machine-readable output for automation
node dist/cli.js scan --json
```

**JSON Structure:**
```json
{
  "healthScore": 75,
  "issues": [
    {
      "type": "outdated",
      "packageName": "lodash",
      "currentVersion": "4.17.20",
      "latestVersion": "4.17.21",
      "severity": "high",
      "description": "Package is outdated",
      "fixable": true
    }
  ],
  "packageManager": "npm",
  "projectInfo": {
    "name": "my-app",
    "version": "1.0.0",
    "path": "/path/to/project",
    "packageManager": "npm"
  },
  "securityVulnerabilities": []
}
```

## Issue Types Detected

- **📅 Outdated Packages** - Packages with newer versions available
- **❓ Missing Packages** - Dependencies in package.json but not installed
- **💥 Broken Installations** - Corrupted or incomplete package installations
- **🔗 Peer Conflicts** - Incompatible peer dependency requirements
- **⚠️ Version Mismatches** - Installed versions differ from package.json
- **🔒 Security Issues** - Known security vulnerabilities

## Health Score

The health score (0-100) is calculated based on:
- **Security Issues** (40% weight) - Critical security vulnerabilities
- **Outdated Packages** (20% weight) - Packages needing updates
- **Missing Packages** (15% weight) - Dependencies not installed
- **Peer Conflicts** (15% weight) - Compatibility issues
- **Broken Installations** (10% weight) - Corrupted packages

## Examples

### Example 1: Basic Project Analysis
```bash
# Navigate to your project
cd my-react-app

# Run quick check
node /path/to/depmender/dist/cli.js check

# Get detailed report
node /path/to/depmender/dist/cli.js report

# Apply fixes
node /path/to/depmender/dist/cli.js fix

# Upgrade all dependencies
node /path/to/depmender/dist/cli.js upgrade
```

### Example 2: CI/CD Integration
```bash
#!/bin/bash
# ci-dependency-check.sh

PROJECT_PATH="./my-app"
DEPMENDER_PATH="/path/to/depmender"

echo "🔍 Checking dependencies for $PROJECT_PATH"

# Run check and capture results
CHECK_RESULT=$(node $DEPMENDER_PATH/dist/cli.js check --path $PROJECT_PATH --json)
HEALTH_SCORE=$(echo $CHECK_RESULT | jq '.healthScore')
CRITICAL_ISSUES=$(echo $CHECK_RESULT | jq '[.issues[] | select(.severity == "critical")] | length')

echo "Health Score: $HEALTH_SCORE/100"
echo "Critical Issues: $CRITICAL_ISSUES"

# Fail CI if health score is too low or critical issues exist
if [ $HEALTH_SCORE -lt 70 ] || [ $CRITICAL_ISSUES -gt 0 ]; then
  echo "❌ Dependency check failed!"
  echo "Run 'depmender report' for details"
  exit 1
else
  echo "✅ Dependency check passed!"
fi
```

### Example 3: Batch Processing
```bash
#!/bin/bash
# analyze-all-projects.sh

DEPMENDER_PATH="/path/to/depmender"
PROJECTS_DIR="./projects"

for project in $PROJECTS_DIR/*/; do
  if [ -f "$project/package.json" ]; then
    echo "Analyzing $(basename $project)..."
    node $DEPMENDER_PATH/dist/cli.js check --path "$project" --json > "reports/$(basename $project)-report.json"
  fi
done

echo "All reports generated in ./reports/"
```

## Troubleshooting

### Common Issues

1. **"package.json not found"**
   ```bash
   # Make sure you're in the right directory or specify correct path
   node dist/cli.js check --path /correct/path/to/project
   ```

2. **"Permission denied"**
   ```bash
   # Make sure you have read permissions for the project directory
   chmod -R 755 /path/to/project
   ```

3. **"Scanner failed"**
   ```bash
   # Run with verbose output to see detailed error information
   node dist/cli.js check --verbose
   ```

4. **Network issues during analysis**
   ```bash
   # Some features require internet access for latest version checks
   # Ensure you have internet connectivity
   ```

### Getting Help

```bash
# Show all available commands and options
node dist/cli.js --help

# Get detailed help for specific commands
node dist/cli.js help check
node dist/cli.js help report
node dist/cli.js help fix
node dist/cli.js help upgrade

# Show usage examples
node dist/cli.js examples

# Show troubleshooting guide
node dist/cli.js troubleshooting
```

## Tips for Best Results

1. **Run regularly** - Include dependency checks in your development workflow
2. **Fix critical issues first** - Address security vulnerabilities immediately
3. **Test after fixes** - Always test your application after applying fixes
4. **Use in CI/CD** - Automate dependency health checks in your pipeline
5. **Keep backups** - The tool creates backups, but maintain your own as well
6. **Review recommendations** - Don't blindly apply all fixes; review them first

---

**Need more help?** Run `node dist/cli.js help` or `node dist/cli.js troubleshooting` for additional guidance.