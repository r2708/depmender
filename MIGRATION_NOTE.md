# DepMender - Simplified to 5 Commands

## Summary

DepMender has been simplified to just **5 essential commands**:

1. **check** - Check project dependencies and system health
2. **report** - Generate detailed health reports
3. **fix** - Fix all dependency issues
4. **upgrade** - Upgrade all dependencies to latest versions
5. **init** - Initialize configuration file

## What Changed

### Removed Commands
These commands have been removed or consolidated:
- ❌ `scan` → Renamed to `check`
- ❌ `doctor` → Merged into `check`
- ❌ `clean` → Functionality moved to `fix`
- ❌ `watch` → Removed (not essential)

### New/Updated Commands
- ✅ `check` - New name for scan, includes doctor functionality
- ✅ `report` - Unchanged
- ✅ `fix` - Enhanced to handle all fix operations
- ✅ `upgrade` - New command for upgrading dependencies
- ✅ `init` - Unchanged

## Command Details

### 1. depmender check
Analyzes your project dependencies and system health.

**Replaces:** `scan` + `doctor`

```bash
depmender check                   # Check current directory
depmender check --path ./my-app   # Check specific project
depmender check --json            # JSON output
depmender check --verbose         # Detailed output
```

**What it checks:**
- Outdated packages
- Missing dependencies
- Broken installations
- Security vulnerabilities
- Peer dependency conflicts
- Version mismatches
- Node.js environment
- Project structure
- Package manager health

### 2. depmender report
Generates detailed health report with issue breakdown.

```bash
depmender report                  # Generate report
depmender report --json           # JSON format
depmender report --verbose        # Extra details
```

### 3. depmender fix
Unified command that fixes ALL dependency issues.

**Handles all these operations:**
- install-missing
- remove-unused
- update-deps
- version-fix / fix-versions
- dependency-sync / sync
- cleanup
- dedupe
- sort
- validate
- deep-scan
- repair
- auto-fix
- normalize
- optimize
- resolve

```bash
depmender fix                     # Interactive mode
depmender fix --yes               # Auto-fix mode
depmender fix --path ./backend    # Fix specific project
```

### 4. depmender upgrade
Upgrades all dependencies to their latest versions.

**New command** - specifically for upgrading packages.

```bash
depmender upgrade                 # Interactive mode
depmender upgrade --yes           # Auto-upgrade mode
depmender upgrade --path ./api    # Upgrade specific project
```

### 5. depmender init
Initialize depmender configuration file.

```bash
depmender init                    # Create config
depmender init --force            # Overwrite existing
```

## Migration Guide

### Old → New Command Mapping

```bash
# Old commands → New commands
depmender scan          → depmender check
depmender doctor        → depmender check
depmender report        → depmender report (unchanged)
depmender fix           → depmender fix (unchanged)
depmender clean         → depmender fix (handles cleanup)
depmender watch         → (removed - not essential)
depmender init          → depmender init (unchanged)

# New command
depmender upgrade       → (new - for upgrading dependencies)
```

### Typical Workflow

```bash
# 1. Check project health
depmender check

# 2. Get detailed report
depmender report

# 3. Fix all issues
depmender fix --yes

# 4. Upgrade dependencies (optional)
depmender upgrade --yes

# 5. Verify everything is good
depmender check
```

## Benefits

1. **Simplicity** - Only 5 commands to remember
2. **Clarity** - Each command has a clear purpose
3. **Efficiency** - No redundant commands
4. **Power** - All functionality still available
5. **Ease of use** - Intuitive command names

## No Breaking Changes for Core Workflow

The core workflow remains the same:
- Analyze → Report → Fix

Only command names changed:
- `scan` → `check` (more intuitive)
- Added `upgrade` for explicit upgrade operations
