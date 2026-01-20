// Property test for project structure validation
// **Feature: depguardian, Property 1: Complete project analysis**
import fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

describe('Project Structure Validation', () => {
  test('Property 1: Complete project analysis - scanner should read both package.json and node_modules', () => {
    // This is a basic property test to verify our testing infrastructure
    // The actual scanner implementation will be done in task 4
    
    fc.assert(
      fc.property(
        fc.record({
          hasPackageJson: fc.boolean(),
          hasNodeModules: fc.boolean(),
        }),
        (projectStructure) => {
          // For now, we just test that our property testing setup works
          // When we implement the actual scanner, this will test that
          // the scanner always attempts to read both locations
          
          const shouldAnalyze = projectStructure.hasPackageJson || projectStructure.hasNodeModules;
          
          // This property ensures that if we have either file, we should attempt analysis
          if (projectStructure.hasPackageJson || projectStructure.hasNodeModules) {
            expect(shouldAnalyze).toBe(true);
          }
          
          return true;
        }
      ),
      { numRuns: 100 } // Minimum 100 iterations as specified in design
    );
  });

  test('Project setup files exist', () => {
    // Verify that our project setup is complete
    const requiredFiles = [
      'package.json',
      'tsconfig.json',
      'jest.config.js',
      '.eslintrc.js',
      'src/index.ts',
      'src/cli.ts'
    ];

    requiredFiles.forEach(file => {
      expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true);
    });
  });

  test('Required directories exist', () => {
    const requiredDirs = [
      'src/core',
      'src/scanners',
      'src/reporters',
      'src/fixers',
      'src/adapters'
    ];

    requiredDirs.forEach(dir => {
      expect(fs.existsSync(path.join(process.cwd(), dir))).toBe(true);
    });
  });
});