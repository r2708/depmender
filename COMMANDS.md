# DepMender Commands Reference

DepMender provides 5 simple commands for managing your project dependencies.

## Quick Reference

| Command | Purpose | Example |
|---------|---------|---------|
| `check` | Check dependencies and system health | `depmender check` |
| `report` | Generate detailed health report | `depmender report --verbose` |
| `fix` | Fix all dependency issues | `depmender fix --yes` |
| `upgrade` | Upgrade all dependencies | `depmender upgrade --yes` |
| `init` | Initialize configuration | `depmender init` |

## Detailed Command Reference

### 1. depmender check

**Purpose:** Analyze project dependencies and system health

**Usage:**
```bash
depmender check [options]
```

**Options:**
- `-p, --path <path>` - Project path to analyze (default: current directory)
- `--json` - Output results in JSON format
- `--verbose` - Enable verbose output
- `--quiet` - Suppress all logs except errors

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

**Examples:**
```bash
# Check current directory
depmender check

# Check specific project
depmender check --path ./my-app

# Get JSON output
depmender check --json

# Verbose output
depmender check --verbose
```

---

### 2. depmender report

**Purpose:** Generate detailed dependency health report

**Usage:**
```bash
depmender report [options]
```

**Options:**
- `-p, --path <path>` - Project path to analyze
- `--json` - Output results in JSON format
- `--verbose` - Include extra details
- `--quiet` - Suppress all logs except errors

**What it includes:**
- Overall health score
- Issue breakdown by type
- Security vulnerabilities
- Outdated packages with versions
- Recommendations and next steps
- Detailed analysis of each issue

**Examples:**
```bash
# Generate report
depmender report

# Export as JSON
depmender report --json > report.json

# Detailed report
depmender report --verbose
```

---

### 3. depmender fix

**Purpose:** Automatically fix all dependency issues

**Usage:**
```bash
depmender fix [options]
```

**Options:**
- `-p, --path <path>` - Project path to fix
- `-y, --yes` - Auto-confirm all fixes without prompting
- `--json` - Output results in JSON format
- `--verbose` - Show detailed fix process
- `--quiet` - Suppress all logs except errors

**What it fixes:**
- Installs missing dependencies
- Removes unused dependencies
- Updates outdated packages (safe versions)
- Fixes version mismatches
- Resolves peer conflicts
- Deduplicates dependencies
- Syncs package.json with lockfile
- Repairs broken installations
- Normalizes dependency structure
- Optimizes dependency tree

**Safety features:**
- Automatic backup creation
- Risk assessment for each fix
- Confirmation prompts (unless --yes)
- Rollback capability
- Detailed logging

**Examples:**
```bash
# Interactive mode (with prompts)
depmender fix

# Auto-fix without confirmation
depmender fix --yes

# Fix specific project
depmender fix --path ./backend

# Verbose output
depmender fix --verbose
```

---

### 4. depmender upgrade

**Purpose:** Upgrade all dependencies to their latest versions

**Usage:**
```bash
depmender upgrade [options]
```

**Options:**
- `-p, --path <path>` - Project path to upgrade
- `-y, --yes` - Auto-confirm all upgrades without prompting
- `--json` - Output results in JSON format
- `--verbose` - Show detailed upgrade process
- `--quiet` - Suppress all logs except errors

**What it does:**
- Identifies all outdated packages
- Upgrades to latest versions
- Creates automatic backups
- Shows detailed upgrade plan
- Provides risk assessment
- Enables safe rollback

**Examples:**
```bash
# Interactive mode (with prompts)
depmender upgrade

# Auto-upgrade without confirmation
depmender upgrade --yes

# Upgrade specific project
depmender upgrade --path ./api

# Verbose output
depmender upgrade --verbose
```

---

### 5. depmender init

**Purpose:** Initialize depmender configuration file

**Usage:**
```bash
depmender init [options]
```

**Options:**
- `-p, --path <path>` - Project path
- `--force` - Overwrite existing configuration file

**What it creates:**
Creates a `depmender.config.js` file with:
- Scanning rules
- Auto-fix settings
- Output formatting options
- Integration configurations

**Examples:**
```bash
# Create config file
depmender init

# Overwrite existing config
depmender init --force
```

---

## Common Workflows

### Daily Development
```bash
# Quick health check
depmender check

# Fix any issues
depmender fix --yes
```

### Before Deployment
```bash
# Detailed analysis
depmender report --verbose

# Fix all issues
depmender fix --yes

# Verify everything is good
depmender check
```

### Dependency Maintenance
```bash
# Check for updates
depmender check

# Upgrade all dependencies
depmender upgrade --yes

# Run tests
npm test

# Verify health
depmender check
```

### CI/CD Integration
```bash
# Generate JSON report
depmender check --json > report.json

# Fail build on critical issues
depmender check --json | jq '.healthScore < 50' && exit 1

# Auto-fix in CI
depmender fix --yes && npm test
```

---

## Global Options

All commands support these global options:

- `-p, --path <path>` - Project path to analyze (default: current directory)
- `--json` - Output results in JSON format
- `--verbose` - Enable verbose output with additional details
- `--quiet` - Suppress all logs except errors
- `-h, --help` - Display help for command

---

## Getting Help

```bash
# General help
depmender --help

# Command-specific help
depmender check --help
depmender report --help
depmender fix --help
depmender upgrade --help
depmender init --help

# Show examples
depmender examples

# Troubleshooting guide
depmender troubleshooting
```

---

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Configuration error
- `3` - Critical issues found (when used in CI)

---

## Tips

1. **Run check regularly** - Include in your development workflow
2. **Use --json in CI** - For automated processing
3. **Test after fixes** - Always test your application after applying fixes
4. **Backup before upgrade** - The tool creates backups, but maintain your own too
5. **Review before --yes** - Understand what will be changed before using auto-confirm
