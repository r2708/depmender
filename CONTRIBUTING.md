# Contributing to DepMender

Thank you for your interest in contributing to DepMender! We welcome contributions from the community.

## 🤝 How to Contribute

### Reporting Bugs

If you find a bug, please open an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Node.js version, package manager)
- Screenshots if applicable

### Suggesting Features

We love new ideas! Please open an issue with:
- Clear description of the feature
- Use cases and benefits
- Possible implementation approach
- Examples of similar features in other tools

### Submitting Pull Requests

1. **Fork the repository**
   ```bash
   git clone https://github.com/yourusername/depmender.git
   cd depmender
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Make your changes**
   - Write clean, readable code
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation if needed

5. **Test your changes**
   ```bash
   npm run build
   npm test
   node dist/cli.js --help
   ```

6. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

7. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Open a Pull Request**
   - Provide clear description of changes
   - Reference related issues
   - Include screenshots/examples if applicable

## 📋 Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Use meaningful variable and function names
- Keep functions small and focused
- Add JSDoc comments for public APIs

### Project Structure

```
depmender/
├── src/
│   ├── adapters/      # Package manager adapters
│   ├── commands/      # CLI commands
│   ├── core/          # Core functionality
│   ├── fixers/        # Fix suggestion engine
│   ├── reporters/     # Report generators
│   ├── scanners/      # Dependency scanners
│   └── utils/         # Utility functions
├── dist/              # Compiled output
└── tests/             # Test files
```

### Testing

- Write tests for new features
- Ensure existing tests pass
- Test with different package managers (npm, yarn, pnpm)
- Test on different operating systems if possible

### Documentation

- Update README.md for new features
- Add examples for new commands
- Update CHANGELOG.md
- Add inline code comments

## 🎯 Areas for Contribution

### High Priority
- [ ] Add test coverage
- [ ] Improve error messages
- [ ] Add more package manager support
- [ ] Performance optimizations

### Medium Priority
- [ ] Add HTML report generation
- [ ] Improve configuration validation
- [ ] Add more integration options
- [ ] Better progress indicators

### Low Priority
- [ ] Add interactive mode improvements
- [ ] Add more output formats
- [ ] Improve documentation
- [ ] Add more examples

## 🐛 Bug Fixes

When fixing bugs:
1. Add a test that reproduces the bug
2. Fix the bug
3. Ensure the test passes
4. Update documentation if needed

## ✨ Feature Development

When adding features:
1. Discuss the feature in an issue first
2. Get feedback from maintainers
3. Implement the feature
4. Add tests
5. Update documentation
6. Submit PR

## 📝 Documentation

Help improve documentation:
- Fix typos and grammar
- Add examples
- Improve clarity
- Add tutorials
- Translate to other languages

## 🔍 Code Review Process

All PRs will be reviewed by maintainers:
- Code quality and style
- Test coverage
- Documentation
- Performance impact
- Breaking changes

## 💬 Communication

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - General questions and discussions
- **Pull Requests** - Code contributions

## 📜 Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Help others learn and grow

## 🙏 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

## ❓ Questions?

Feel free to:
- Open an issue
- Start a discussion
- Reach out to maintainers

Thank you for contributing to DepMender! 🎉
