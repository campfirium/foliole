// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareIosAcceptanceCache } from './ios-local-storage.mjs';

// The Apple framework contract runs on macOS; other hosts cannot load this native framework.
const native = describe.runIf(process.platform === 'darwin');
native('resolved SQLCipher native security and persistence', () => {
  let root;
  let binary;
  beforeAll(() => {
    const artifacts = path.resolve('.tmp/artifacts/T674/sqlcipher-native-tests');
    mkdirSync(artifacts, { recursive: true });
    root = mkdtempSync(path.join(artifacts, 'run-'));
    binary = path.join(root, 'contract');
    const cache = prepareIosAcceptanceCache(process.cwd());
    execFileSync('xcodebuild', ['-resolvePackageDependencies', '-project', 'ios/App/App.xcodeproj',
      '-scheme', 'App', '-onlyUsePackageVersionsFromResolvedFile', '-derivedDataPath', cache.derivedData,
      '-clonedSourcePackagesDirPath', cache.sourcePackages], { stdio: 'pipe', timeout: 180_000 });
    const framework = path.join(cache.sourcePackages,
      'artifacts/sqlcipher.swift/SQLCipher/SQLCipher.xcframework/macos-arm64_x86_64');
    expect(existsSync(path.join(framework, 'SQLCipher.framework')),
      'Resolve the App Swift packages before native dependency verification').toBe(true);
    execFileSync('xcrun', ['clang', 'scripts/ios/sqlcipher-security-fixture.c',
      '-I', path.join(framework, 'SQLCipher.framework/Headers'), '-F', framework,
      '-framework', 'SQLCipher', `-Wl,-rpath,${framework}`, '-o', binary]);
  }, 180_000);
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });
  const run = (...args) => execFileSync(binary, args, { encoding: 'utf8' });
  it('rejects an invalid nonempty URI hexkey instead of creating an unencrypted database', () => {
    expect(run('hexkey', `file:${path.join(root, 'invalid.db')}?hexkey=nothex`)).toContain('contract passed');
  });
  it('exports a quoted SQL-like schema alias without changing the source sentinel', () => {
    expect(run('alias')).toContain('contract passed');
  });
  it.each(['plaintext', 'encrypted'])('preserves %s transactions, FTS and attached staging across process restarts', mode => {
    const file = path.join(root, `${mode}.db`);
    run('create', file, mode);
    expect(run('verify', file, mode)).toContain('contract passed');
  });
});
