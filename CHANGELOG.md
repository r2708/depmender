# Changelog

All notable changes to DepMender will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-01-28

### 🎉 Major Release - New Features

#### Added
- **Configuration System** - Flexible config file support (JS/JSON)
  - Customizable scanning rules
  - Auto-fix settings with risk levels
  - Output formatting options
  - Integration support (Slack, GitHub)

- **Doctor Command** - Comprehensive system health diagnostics
  - Node.js environment checks
  - Project structure validation
  - Package manager health analysis
  - Performance metrics
  - Security audit integration
  - Personalized recommendations

- **Clean Command** - Unused dependency detection and removal
  - Smart code analysis (imports/requires)
  - Safe dependency protection
  - Dry-run mode for safety
  - Space savings calculation

- **Watch Mode** - Real-time dependency monitoring
  - File change detection
  - Automatic scanning on changes
  - Webhook notifications
  - Desktop notifications support
  - Auto-fix capabilities

- **Init Command** - Configuration file generator
  - Sample config creation
  - Force overwrite option

#### Improved
- **Performance Optimization**
  - Parallel scanner execution (~30% faster)
  - Version parsing cache (~20% memory reduction)
  - Risk assessment memoization
  - Optimized CLI argument parsing

- **Package Size Reduction**
  - Removed source maps from production build
  - Removed declaration files
  - Reduced from 745KB to 463KB (~38% reduction)

#### Changed
- Updated CLI description to be more comprehensive
- Enhanced help system with new commands
- Improved error handling and logging

### 📦 Package Updates
- Added `chokidar` for file watching
- Updated TypeScript configuration for production builds

## [1.3.0] - 2024-01-21

### Added
- Enhanced scanning capabilities
- Improved fix suggestions
- Better error messages for package operations

### Fixed
- Invalid package name filtering (`.bin`, `.cache`, etc.)
- Version validation to prevent fake version suggestions
- Peer dependency handling with `--legacy-peer-deps` flag

### Changed
- Clearer messaging for package reinstallation
- Updated version to 1.3.0 for npm publishing

## [1.2.0] - 2024-01-20

### Added
- Available commands section in scan results
- Comprehensive help system

### Improved
- Removed unnecessary logs from terminal output
- Cleaner scan results display

## [1.1.0] - 2024-01-19

### Added
- Initial release with core functionality
- Scan command for dependency analysis
- Report command for detailed health reports
- Fix command for automated issue resolution
- Support for npm, yarn, and pnpm
- Security vulnerability detection
- Outdated package detection
- Broken installation detection
- Missing dependency detection
- Peer conflict detection
- Version mismatch detection

### Features
- Health score calculation
- Risk-based fix suggestions
- Backup creation before fixes
- JSON output support
- Verbose logging option

---

## Legend

- 🎉 Major features
- ✨ New features
- 🐛 Bug fixes
- 🔧 Improvements
- 📦 Dependencies
- 🚀 Performance
- 📝 Documentation
- ⚠️ Breaking changes

[2.0.0]: https://github.com/yourusername/depmender/releases/tag/v2.0.0
[1.3.0]: https://github.com/yourusername/depmender/releases/tag/v1.3.0
[1.2.0]: https://github.com/yourusername/depmender/releases/tag/v1.2.0
[1.1.0]: https://github.com/yourusername/depmender/releases/tag/v1.1.0
