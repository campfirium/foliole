// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { runAndroidDependencySecurity } from '../android/android-dependency-security.mjs';
import { prepareAndroidSecurityFixture } from '../android/android-security-fixture.mjs';
import { execute, captured } from '../android/macos-a5-process.mjs';
import { captureSecurityCandidate } from './security-inputs.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function repository() {
  const artifacts = path.resolve('.tmp/artifacts/T674/security-receipt-tests');
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(path.join(artifacts, 'repo-'));
  roots.push(root);
  for (const directory of ['android', 'scripts/android']) mkdirSync(path.join(root, directory), { recursive: true });
  prepareAndroidSecurityFixture(path.join(root, 'android'));
  for (const file of ['android-dependency-inventory.gradle', 'android-toolchain-inventory.gradle']) {
    copyFileSync(`scripts/android/${file}`, path.join(root, 'scripts/android', file));
  }
  for (const file of ['package.json', 'package-lock.json', '.npmrc']) writeFileSync(path.join(root, file), '{}');
  writeFileSync(path.join(root, '.gitignore'), '.gradle/\nreports/\n');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
  return { root, git };
}

// Windows is not an Android build host; exercise real Gradle on Mac/Linux.
describe.runIf(process.platform !== 'win32')('native Gradle input receipts', () => {
it.each([false, true])('binds real Gradle evidence to stable inputs and retains findings if inputs change: mutate=%s', async mutate => {
  const { root, git } = repository();
  const original = captureSecurityCandidate(root, git);
  const args = { paths: { buildRoot: root, artifactsRoot: path.join(root, 'reports'), runId: 'fixture',
    gradle: path.resolve('android/gradlew') }, env: process.env, captured,
  execute: async (...parameters) => {
    const result = await execute(...parameters);
    if (mutate) appendFileSync(path.join(root, 'android/build.gradle'), '\n// Changed during collection\n');
    return result;
  }, fetchImpl: async (_url, options) => ({ ok: true, json: async () => ({
    results: JSON.parse(options.body).queries.map(query => mutate && query.package.name === 'example:build-tool'
      ? { vulns: [{ id: 'FIXTURE-RETAINED' }] } : {}) }) }) };
  if (mutate) await expect(runAndroidDependencySecurity(args)).rejects.toThrow('Android Maven check error');
  else await runAndroidDependencySecurity(args);
  const report = JSON.parse(readFileSync(path.join(root, 'reports/security-maintenance/android/fixture/report.json'), 'utf8'));
  expect(report.source.revision).toBe(original.revision);
  expect(report.source.inputDigest).toBe(original.inputDigest);
  expect(report.inventory.configurations.some(row => row.name === 'debugRuntimeClasspath')).toBe(true);
  if (mutate) {
    expect(report.errors).toContainEqual({ reason: 'candidate-inputs-changed-during-extraction' });
    expect(report.findings).toHaveLength(1);
  } else expect(report.status).toBe('clean');
}, 90_000);

});
