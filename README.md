# DepMender

A CLI tool that scans JavaScript/TypeScript projects for dependency issues and fixes them automatically.

## What it does

DepMender helps you maintain healthy dependencies by scanning your project for issues like outdated packages, broken installations, missing dependencies, and security vulnerabilities, then automatically fixes them.

## Installation

```bash
npm install -g depmender
```

## Commands

### `depmender scan`
Analyzes your project dependencies and shows health overview.

```bash
depmender scan                    # Scan current directory
depmender scan --path ./frontend  # Scan specific directory
depmender scan --json            # Get JSON output
```

### `depmender report`
Generates detailed health report with issue breakdown.

```bash
depmender report                  # Generate detailed report
depmender report --json          # Export as JSON
```

### `depmender fix`
Automatically fixes detected issues with backup creation.

```bash
depmender fix                     # Interactive fix with prompts
depmender fix --yes              # Auto-fix without confirmation
```

### `depmender help`
Shows help information.

```bash
depmender help                   # General help
```

### `depmender examples`
Shows usage examples.

```bash
depmender examples              # Show examples
```

### `depmender troubleshooting`
Shows troubleshooting guide.

```bash
depmender troubleshooting       # Show troubleshooting
```

## License

MIT