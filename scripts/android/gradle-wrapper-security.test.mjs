// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { macosA5GradleEnv } from './macos-a5-runtime-paths.mjs';

const wrapperRoot = path.resolve('android/gradle/wrapper');
const properties = readFileSync(path.join(wrapperRoot, 'gradle-wrapper.properties'), 'utf8');

describe('Android Gradle distribution security', () => {
  it('selects the patched Gradle 8 maintenance line over HTTPS with integrity verification', () => {
    const version = properties.match(/gradle-(\d+)\.(\d+)\.(\d+)-all\.zip/u);
    expect(version, 'The Android build must select an explicit Gradle distribution').not.toBeNull();
    const [, major, minor, patch] = version.map(Number);
    expect(major).toBe(8);
    expect(minor > 14 || (minor === 14 && patch >= 6)).toBe(true);
    expect(properties).toMatch(/^distributionUrl=https\\:\/\/services\.gradle\.org\//mu);
    expect(properties).toMatch(/^distributionSha256Sum=[a-f0-9]{64}$/mu);
  });

  it('rejects altered distribution bytes before loading the Gradle runtime', () => {
    const artifactsRoot = path.resolve('.tmp/artifacts/T674/wrapper-tests');
    mkdirSync(artifactsRoot, { recursive: true });
    const root = mkdtempSync(path.join(artifactsRoot, 'integrity-'));
    try {
      const distribution = path.join(root, 'altered-gradle.zip');
      writeFileSync(distribution, 'These bytes are not the official Gradle distribution.');
      const wrapperDir = path.join(root, 'gradle/wrapper');
      mkdirSync(wrapperDir, { recursive: true });
      writeFileSync(path.join(wrapperDir, 'gradle-wrapper.jar'),
        readFileSync(path.join(wrapperRoot, 'gradle-wrapper.jar')));
      writeFileSync(path.join(wrapperDir, 'gradle-wrapper.properties'), properties.replace(
        /^distributionUrl=.*$/mu, `distributionUrl=${pathToFileURL(distribution).href}`
      ));
      const env = macosA5GradleEnv();
      const java = process.platform === 'darwin' ? path.join(env.JAVA_HOME, 'bin/java') : 'java';
      const result = spawnSync(java, [
        '-Dgradle.user.home=' + path.join(root, 'gradle-home'),
        '-cp', path.join(wrapperDir, 'gradle-wrapper.jar'),
        'org.gradle.wrapper.GradleWrapperMain', '--version'
      ], { cwd: root, encoding: 'utf8', env, timeout: 20_000 });
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('Verification of Gradle distribution failed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
