// Test file to check if types work in real usage
import { 
  PackageJson, 
  DependencyIssue, 
  IssueType, 
  IssueSeverity,
  PackageManagerType,
  AnalysisResult 
} from './src/core/types';

// Example: Create a sample package.json
const samplePackageJson: PackageJson = {
  name: "my-test-project",
  version: "1.0.0",
  dependencies: {
    "lodash": "^4.17.20",
    "express": "^4.18.0"
  },
  devDependencies: {
    "typescript": "^5.0.0"
  }
};

// Example: Create a dependency issue
const outdatedIssue: DependencyIssue = {
  type: IssueType.OUTDATED,
  packageName: "lodash",
  currentVersion: "4.17.20",
  latestVersion: "4.17.21",
  severity: IssueSeverity.MEDIUM,
  description: "Package lodash is outdated",
  fixable: true
};

// Example: Create analysis result
const analysisResult: AnalysisResult = {
  healthScore: 75,
  issues: [outdatedIssue],
  packageManager: PackageManagerType.NPM,
  projectInfo: {
    name: "my-test-project",
    version: "1.0.0",
    path: "/path/to/project",
    packageManager: PackageManagerType.NPM
  },
  securityVulnerabilities: []
};

console.log("✅ Types are working correctly!");
console.log("Sample Analysis Result:", analysisResult);