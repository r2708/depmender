// Depmender Configuration
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
    confirmBeforeFix: true,        // Ask for confirmation before fixing
    backupBeforeFix: true,         // Create backup before fixing
    maxRiskLevel: 'medium'         // Only auto-fix low/medium risk issues
  },
  
  // Output customization
  output: {
    format: 'detailed',            // 'minimal', 'detailed', 'json'
    showSuccessMessages: true,     // Show success messages
    colors: true                   // Enable colored output
  },
  
  // Integration settings (optional)
  integrations: {
    slack: {
      webhook: '',                 // Slack webhook URL
      notifyOnCritical: true       // Notify on critical issues
    },
    github: {
      createIssues: false,         // Create GitHub issues for problems
      assignTo: ''                 // GitHub username to assign issues
    }
  }
};
