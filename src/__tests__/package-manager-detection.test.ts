import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { PackageManagerDetector } from '../adapters/PackageManagerDetector';
import { PackageManagerType } from '../core/types';

describe('Package Manager Detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'depguardian-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(tempDir);
  });

  test('should detect npm from package-lock.json', async () => {
    // Create package-lock.json
    await fs.writeJson(path.join(tempDir, 'package-lock.json'), {
      name: 'test-project',
      version: '1.0.0',
      lockfileVersion: 2
    });

    const detected = await PackageManagerDetector.detect(tempDir);
    expect(detected).toBe(PackageManagerType.NPM);
  });

  test('should detect yarn from yarn.lock', async () => {
    // Create yarn.lock
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');

    const detected = await PackageManagerDetector.detect(tempDir);
    expect(detected).toBe(PackageManagerType.YARN);
  });

  test('should detect pnpm from pnpm-lock.yaml', async () => {
    // Create pnpm-lock.yaml
    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n');

    const detected = await PackageManagerDetector.detect(tempDir);
    expect(detected).toBe(PackageManagerType.PNPM);
  });

  test('should prioritize pnpm over yarn over npm when multiple lockfiles exist', async () => {
    // Create all lockfiles
    await fs.writeJson(path.join(tempDir, 'package-lock.json'), { name: 'test' });
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');
    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n');

    const detected = await PackageManagerDetector.detect(tempDir);
    expect(detected).toBe(PackageManagerType.PNPM);
  });

  test('should detect from package.json packageManager field', async () => {
    // Create package.json with packageManager field
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'test-project',
      version: '1.0.0',
      packageManager: 'yarn@3.2.1'
    });

    const detected = await PackageManagerDetector.detect(tempDir);
    expect(detected).toBe(PackageManagerType.YARN);
  });

  test('should default to npm when no indicators found', async () => {
    // Create only package.json without any package manager indicators
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'test-project',
      version: '1.0.0'
    });

    const detected = await PackageManagerDetector.detect(tempDir);
    expect(detected).toBe(PackageManagerType.NPM);
  });

  test('should get available lockfiles', async () => {
    // Create multiple lockfiles
    await fs.writeJson(path.join(tempDir, 'package-lock.json'), { name: 'test' });
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');

    const lockfiles = await PackageManagerDetector.getAvailableLockfiles(tempDir);
    expect(lockfiles).toContain('package-lock.json');
    expect(lockfiles).toContain('yarn.lock');
    expect(lockfiles).toHaveLength(2);
  });

  test('should validate package manager consistency', async () => {
    // Create npm lockfile
    await fs.writeJson(path.join(tempDir, 'package-lock.json'), { name: 'test' });

    const validation = await PackageManagerDetector.validatePackageManager(
      tempDir, 
      PackageManagerType.NPM
    );

    expect(validation.isValid).toBe(true);
    expect(validation.warnings).toHaveLength(0);
  });

  test('should warn about multiple lockfiles', async () => {
    // Create multiple lockfiles
    await fs.writeJson(path.join(tempDir, 'package-lock.json'), { name: 'test' });
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');

    const validation = await PackageManagerDetector.validatePackageManager(
      tempDir, 
      PackageManagerType.NPM
    );

    expect(validation.warnings.length).toBeGreaterThan(0);
    expect(validation.warnings[0]).toContain('Multiple lockfiles detected');
  });

  test('should warn about mismatched package manager and lockfile', async () => {
    // Create yarn lockfile but detect as npm
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');

    const validation = await PackageManagerDetector.validatePackageManager(
      tempDir, 
      PackageManagerType.NPM
    );

    expect(validation.isValid).toBe(false);
    expect(validation.warnings.length).toBeGreaterThan(0);
    expect(validation.warnings[0]).toContain("doesn't match available lockfiles");
  });
});