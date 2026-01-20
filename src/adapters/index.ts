// Package Manager Adapters
export { PackageManagerDetector } from './PackageManagerDetector';
export { BasePackageManagerAdapter } from './BasePackageManagerAdapter';
export { NPMAdapter } from './NPMAdapter';
export type { NPMDependencyTree, NPMDependency, NPMPackage, NPMConfig } from './NPMAdapter';
export { YarnAdapter } from './YarnAdapter';
export type { YarnDependencyTree, YarnLockContent, YarnDependency, YarnConfig } from './YarnAdapter';
export { PNPMAdapter } from './PNPMAdapter';
export type { PNPMDependencyTree, PNPMDependency, PNPMPackageDetails, PNPMConfig } from './PNPMAdapter';