// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/t5-nightly-remote-quality.yml', 'utf8');

describe('T5 nightly remote quality workflow contract', () => {
  it('runs twice per day at the agreed Beijing windows and can be dispatched manually', () => {
    expect(workflow).toContain('name: T5 Nightly Remote Quality');
    expect(workflow).toContain("cron: '0 4 * * *'");
    expect(workflow).toContain("cron: '0 16 * * *'");
    expect(workflow).toContain('12:00 Asia/Shanghai');
    expect(workflow).toContain('00:00 Asia/Shanghai');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('target_sha:');
    expect(workflow).toContain('required: true');
  });

  it('checks one immutable target SHA with a remote release-base subset without publishing release artifacts', () => {
    expect(workflow.match(/ref: \$\{\{ env\.T5_TARGET_SHA \}\}/gu)).toHaveLength(2);
    expect(workflow).not.toContain('ref: dev');
    expect(workflow).toContain('T5_TARGET_SHA: ${{ github.event.inputs.target_sha || github.sha }}');
    expect(workflow.match(/Verify target SHA/gu)).toHaveLength(2);
    expect(workflow).toContain('echo "- target SHA: ${T5_TARGET_SHA}"');
    expect(workflow).toContain('remote release-base subset');
    expect(workflow).toContain('npm run electron:rebuild:native');
    expect(workflow).toContain('node scripts/electron-sqlite-runner.mjs --preflight');
    expect(workflow.indexOf('npm run electron:rebuild:native')).toBeLessThan(
      workflow.indexOf('npm run test:release:desktop-src')
    );
    for (const command of [
      'npm run deps:hardening:check',
      'npm run lint:full',
      'npm run typecheck:desktop',
      'npm run typecheck:android',
      'npm run test:release:desktop-src',
      'npm run test:release:android',
      'npm run test:release:shared',
      'npm run test:quality:core',
      'npm run test:quality:gate',
      'npm run test:quality:node',
      'npm run test:quality:preview',
      'npm run build:vite-only',
      'npm run electron:compile',
      'npm run android:web:build'
    ]) {
      expect(workflow).toContain(command);
    }
    expect(workflow).not.toContain('npm run quality:release:base');
    expect(workflow).not.toContain('npm run test:windows:native-preview');
    expect(workflow).not.toContain('gh release');
    expect(workflow).not.toContain('softprops/action-gh-release');
    expect(workflow).not.toContain('ncipollo/release-action');
  });

  it('runs dependency hardening once after install and before native rebuild or release-base validation', () => {
    const releaseBaseJob = workflow.slice(
      workflow.indexOf('  release-base-quality:'),
      workflow.indexOf('  windows-x64-ci:')
    );
    expect(releaseBaseJob.match(/npm run deps:hardening:check/gu)).toHaveLength(1);
    expect(releaseBaseJob.indexOf('run: npm ci')).toBeLessThan(
      releaseBaseJob.indexOf('npm run deps:hardening:check')
    );
    expect(releaseBaseJob.indexOf('npm run deps:hardening:check')).toBeLessThan(
      releaseBaseJob.indexOf('npm run electron:rebuild:native')
    );
  });

  it('does not cancel an in-flight T5 run when another trigger arrives', () => {
    expect(workflow).toContain(
      'group: t5-nightly-remote-quality-${{ github.event.inputs.target_sha || github.sha }}'
    );
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('timeout-minutes: 120');
  });

  it('owns Windows x64 validation without restoring per-push or PR T4 checks', () => {
    expect(workflow).toContain('windows-x64-ci:');
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('npm run test:windows:core');
    expect(workflow).toContain('node scripts/windows/windows-ci-playwright-profile.mjs');
    expect(workflow).not.toContain('\n  push:');
    expect(workflow).not.toContain('\n  pull_request:');
  });

  it('keeps retired remote T4 workflows absent', () => {
    expect(fs.existsSync('.github/workflows/dev-push-health.yml')).toBe(false);
    expect(fs.existsSync('.github/workflows/windows-x64-ci.yml')).toBe(false);
  });
});
