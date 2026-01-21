import chalk from 'chalk';
import { CLIFormatter } from './CLIFormatter';

/**
 * Comprehensive help system for CLI commands
 * Requirement 6.7: Comprehensive help documentation
 */
export class HelpSystem {
  
  /**
   * Gets comprehensive help documentation
   */
  static getMainHelp(): string {
    const sections = [
      {
        title: 'DESCRIPTION',
        content: [
          'Depguardian is a comprehensive CLI tool for analyzing, reporting, and fixing',
          'dependency issues in JavaScript/TypeScript projects. It supports npm, yarn,',
          'and pnpm package managers and provides intelligent suggestions for maintaining',
          'healthy project dependencies.'
        ]
      },
      {
        title: 'USAGE',
        content: [
          'depguardian <command> [options]',
          '',
          'Available commands:',
          '  scan     Analyze project dependencies and identify issues',
          '  report   Generate detailed dependency health report',
          '  fix      Automatically fix detected dependency issues'
        ]
      },
      {
        title: 'GLOBAL OPTIONS',
        content: [
          '-p, --path <path>    Project path to analyze (default: current directory)',
          '--json               Output results in JSON format',
          '--verbose            Enable verbose output with additional details',
          '-h, --help           Display help information',
          '-V, --version        Display version number'
        ]
      },
      {
        title: 'EXAMPLES',
        content: [
          'Basic usage:',
          '  depguardian scan                    # Analyze current directory',
          '  depguardian report --verbose        # Generate detailed report',
          '  depguardian fix --yes               # Auto-fix without confirmation',
          '',
          'Advanced usage:',
          '  depguardian scan --path ./my-app    # Analyze specific directory',
          '  depguardian report --json > report.json  # Export JSON report',
          '  depguardian fix --path ./backend    # Fix specific project'
        ]
      },
      {
        title: 'WORKFLOW',
        content: [
          '1. Run "depguardian scan" to get a quick overview of issues',
          '2. Run "depguardian report" for detailed analysis and recommendations',
          '3. Run "depguardian fix" to apply automated fixes',
          '4. Test your application after applying fixes',
          '5. Re-run scan to verify all issues are resolved'
        ]
      }
    ];

    return CLIFormatter.helpText(sections);
  }

  /**
   * Gets help for the scan command
   */
  static getScanHelp(): string {
    const sections = [
      {
        title: 'SCAN COMMAND',
        content: [
          'Analyzes project dependencies and provides a quick overview of issues.',
          'This is typically the first command you run to assess dependency health.'
        ]
      },
      {
        title: 'USAGE',
        content: [
          'depguardian scan [options]'
        ]
      },
      {
        title: 'OPTIONS',
        content: [
          '-p, --path <path>    Project path to analyze (default: current directory)',
          '--json               Output results in JSON format for integration',
          '--verbose            Show additional analysis details'
        ]
      },
      {
        title: 'OUTPUT',
        content: [
          'The scan command provides:',
          '• Project information (name, version, package manager)',
          '• Overall health score (0-100)',
          '• Issue count breakdown by type',
          '• Critical issue warnings',
          '• Next steps recommendations'
        ]
      },
      {
        title: 'EXAMPLES',
        content: [
          'depguardian scan                     # Scan current directory',
          'depguardian scan --path ./frontend   # Scan specific directory',
          'depguardian scan --json              # Get machine-readable output'
        ]
      }
    ];

    return CLIFormatter.helpText(sections);
  }

  /**
   * Gets help for the report command
   */
  static getReportHelp(): string {
    const sections = [
      {
        title: 'REPORT COMMAND',
        content: [
          'Generates a comprehensive dependency health report with detailed analysis,',
          'security vulnerabilities, and actionable recommendations.'
        ]
      },
      {
        title: 'USAGE',
        content: [
          'depguardian report [options]'
        ]
      },
      {
        title: 'OPTIONS',
        content: [
          '-p, --path <path>    Project path to analyze (default: current directory)',
          '--json               Output report in JSON format',
          '--verbose            Include additional metadata and pro tips'
        ]
      },
      {
        title: 'REPORT SECTIONS',
        content: [
          'The report includes:',
          '• Executive summary with health score',
          '• Critical issues requiring immediate attention',
          '• Security vulnerabilities with CVSS scores',
          '• Outdated packages with version information',
          '• Peer dependency conflicts',
          '• Prioritized recommendations with commands'
        ]
      },
      {
        title: 'EXAMPLES',
        content: [
          'depguardian report                   # Generate full report',
          'depguardian report --verbose         # Include additional details',
          'depguardian report --json > report.json  # Export to file'
        ]
      }
    ];

    return CLIFormatter.helpText(sections);
  }

  /**
   * Gets help for the fix command
   */
  static getFixHelp(): string {
    const sections = [
      {
        title: 'FIX COMMAND',
        content: [
          'Automatically applies fixes for detected dependency issues.',
          'Creates backups before making changes and provides detailed feedback.'
        ]
      },
      {
        title: 'USAGE',
        content: [
          'depguardian fix [options]'
        ]
      },
      {
        title: 'OPTIONS',
        content: [
          '-p, --path <path>    Project path to fix (default: current directory)',
          '-y, --yes            Automatically confirm all fixes without prompting',
          '--verbose            Show detailed fix application process'
        ]
      },
      {
        title: 'SAFETY FEATURES',
        content: [
          '• Automatic backup creation before modifications',
          '• Risk assessment for each fix',
          '• Confirmation prompts for potentially breaking changes',
          '• Rollback capability if fixes fail',
          '• Detailed logging of all changes made'
        ]
      },
      {
        title: 'FIX TYPES',
        content: [
          'Automatically handles:',
          '• Installing missing packages',
          '• Updating outdated packages (safe versions)',
          '• Resolving version conflicts',
          '• Regenerating corrupted lockfiles',
          '• Fixing peer dependency issues'
        ]
      },
      {
        title: 'EXAMPLES',
        content: [
          'depguardian fix                      # Interactive fix with prompts',
          'depguardian fix --yes                # Auto-fix without confirmation',
          'depguardian fix --path ./api         # Fix specific project'
        ]
      },
      {
        title: 'POST-FIX RECOMMENDATIONS',
        content: [
          '1. Test your application thoroughly',
          '2. Run your test suite',
          '3. Check for any breaking changes',
          '4. Run "depguardian scan" to verify fixes',
          '5. Commit changes if everything works correctly'
        ]
      }
    ];

    return CLIFormatter.helpText(sections);
  }

  /**
   * Gets troubleshooting help
   */
  static getTroubleshootingHelp(): string {
    const sections = [
      {
        title: 'TROUBLESHOOTING',
        content: [
          'Common issues and solutions when using Depguardian.'
        ]
      },
      {
        title: 'COMMON ISSUES',
        content: [
          'Issue: "package.json not found"',
          'Solution: Make sure you\'re in a valid Node.js project directory',
          'Example: cd /path/to/your/project && depguardian scan',
          '',
          'Issue: "Permission denied" errors',
          'Solution: Check file permissions or run with appropriate privileges',
          'Example: sudo depguardian fix (use with caution)',
          '',
          'Issue: "Network timeout" during analysis',
          'Solution: Check internet connection and try again',
          'Example: depguardian scan --verbose (for more details)',
          '',
          'Issue: "Analysis failed" errors',
          'Solution: Verify package.json is valid JSON and contains required fields',
          'Example: depguardian scan --path ./specific-project'
        ]
      },
      {
        title: 'GETTING HELP',
        content: [
          'If you encounter issues:',
          '1. Check that you\'re in a valid Node.js project',
          '2. Ensure package.json exists and is valid',
          '3. Try running depguardian scan --verbose for more details',
          '4. Check network connectivity for registry access',
          '5. Verify file and directory permissions',
          '6. Use depguardian help for general usage information'
        ]
      }
    ];

    return CLIFormatter.helpText(sections);
  }

  /**
   * Gets examples and use cases
   */
  static getExamplesHelp(): string {
    const sections = [
      {
        title: 'EXAMPLES & USE CASES',
        content: [
          'Common workflows and usage patterns for Depguardian.'
        ]
      },
      {
        title: 'DAILY DEVELOPMENT WORKFLOW',
        content: [
          '# Quick health check',
          'depguardian scan',
          '',
          '# Detailed analysis before deployment',
          'depguardian report --verbose',
          '',
          '# Fix issues automatically',
          'depguardian fix --yes'
        ]
      },
      {
        title: 'CI/CD INTEGRATION',
        content: [
          '# Generate JSON report for CI',
          'depguardian scan --json > dependency-report.json',
          '',
          '# Fail build on critical issues',
          'depguardian scan --json | jq \'.healthScore < 50\' && exit 1',
          '',
          '# Auto-fix in CI (with caution)',
          'depguardian fix --yes && npm test'
        ]
      },
      {
        title: 'MONOREPO USAGE',
        content: [
          '# Analyze specific packages',
          'depguardian scan --path ./packages/frontend',
          'depguardian scan --path ./packages/backend',
          '',
          '# Generate reports for all packages',
          'for dir in packages/*/; do',
          '  depguardian report --path "$dir" --json > "${dir}report.json"',
          'done'
        ]
      },
      {
        title: 'SECURITY FOCUSED WORKFLOW',
        content: [
          '# Focus on security issues',
          'depguardian report | grep -A 10 "SECURITY VULNERABILITIES"',
          '',
          '# Export security report',
          'depguardian report --json | jq \'.securityIssues\' > security.json',
          '',
          '# Fix security issues first',
          'depguardian fix --yes  # Review security fixes carefully'
        ]
      }
    ];

    return CLIFormatter.helpText(sections);
  }
}