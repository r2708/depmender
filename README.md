# Depguardian

A CLI tool that scans JavaScript/TypeScript projects for dependency issues and fixes them.

## Features

- **Dependency Scanner**: Detects outdated, missing, broken, and conflicting dependencies
- **Health Reporting**: Comprehensive reports with health scores (0-100)
- **Smart Suggestions**: Intelligent recommendations with risk assessment
- **Auto-Fix System**: Automated fixes with backup and verification
- **Multi-Package Manager**: Supports npm, yarn, and pnpm
- **Security Analysis**: Vulnerability detection and prioritization

## Installation

```bash
npm install -g depguardian
```

## Usage

```bash
# Scan project dependencies
depguardian scan

# Generate detailed health report
depguardian report

# Apply automated fixes
depguardian fix
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Development mode with watch
npm run dev
```

## License

MIT