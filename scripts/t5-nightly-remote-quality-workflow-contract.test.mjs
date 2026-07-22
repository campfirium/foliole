// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const core = fs.readFileSync('.github/workflows/hosted-quality-core.yml', 'utf8');
const remote = fs.readFileSync('.github/workflows/remote-quality.yml', 'utf8');
const t5 = fs.readFileSync('.github/workflows/t5-nightly-remote-quality.yml', 'utf8');
const monitor = JSON.parse(fs.readFileSync('.codex/monitors/github-actions.json', 'utf8'));

describe('hosted quality workflow contracts', () => {
  it('keeps T5 scheduled ownership separate from thread-owned Remote Quality', () => {
    expect(t5).toContain('name: T5 Nightly Remote Quality');
    expect(t5).toContain("cron: '10 4 * * *'");
    expect(t5).toContain("cron: '10 16 * * *'");
    expect(t5).toContain('uses: ./.github/workflows/hosted-quality-core.yml');
    expect(t5).toContain('scope: full');
    expect(remote).toContain('name: Remote Quality');
    expect(remote).toContain('workflow_dispatch:');
    expect(remote).not.toContain('schedule:');
    expect(monitor.workflows).toEqual(['T5 Nightly Remote Quality']);
    expect(monitor.workflows).not.toContain('Remote Quality');
    expect(monitor.notes).toContain('requesting development task');
    expect(monitor.notes).not.toContain('T4 checks are local-only');
  });

  it('offers explicit Remote Quality scopes through the shared core', () => {
    for (const scope of ['desktop', 'shared', 'android', 'ios', 'full']) {
      expect(remote).toContain(`          - ${scope}`);
    }
    expect(remote).toContain('target_sha: ${{ inputs.target_sha }}');
    expect(remote).toContain('scope: ${{ inputs.scope }}');
  });

  it('maps each scope to its canonical runner and target', () => {
    expect(core).toContain('runs-on: windows-latest');
    expect(core).toContain('runs-on: ubuntu-latest');
    expect(core).toContain('runs-on: macos-15');
    for (const command of [
      'npm run quality:desktop', 'npm run quality:shared', 'npm run quality:android',
      'npm run quality:release:base', 'npm run quality:release:windows:tail',
      'npm run quality:release:android:tail', 'npm run quality:ios:contract',
      'npm run quality:ios:full'
    ]) expect(core).toContain(command);
    const ubuntuSection = core.split('  ubuntu-quality:')[1].split('  macos-quality:')[0];
    expect(ubuntuSection).toContain("inputs.scope == 'android'");
    expect(ubuntuSection).toContain('FOLIOLE_ANDROID_HOST_MODE: native-linux');
    expect(ubuntuSection).toContain("if: inputs.scope == 'shared' || inputs.scope == 'android'");
    expect(ubuntuSection).toContain('npm run electron:rebuild:native');
    expect(ubuntuSection).toContain('npm run quality:android');
    expect(ubuntuSection).toContain('npm run quality:release:android:tail');
    const macosSection = core.split('  macos-quality:')[1];
    expect(macosSection).toContain('npm run electron:rebuild:native');
  });

  it('binds checkout to an immutable SHA under read-only permissions', () => {
    expect(core.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(3);
    expect(core.match(/persist-credentials: false/gu)).toHaveLength(3);
    expect(core.match(/Verify target SHA/gu)).toHaveLength(3);
    for (const workflow of [core, remote, t5]) {
      expect(workflow).toContain('permissions:\n  contents: read');
      expect(workflow).not.toContain('contents: write');
      expect(workflow).not.toContain('secrets.');
    }
  });

  it('keeps only minimal per-scenario Simulator evidence', () => {
    for (const name of ['result.json', 'failure.json', 'simulator.log']) {
      expect(core).toContain(`.tmp/artifacts/ios-bridge-acceptance/*/${name}`);
    }
    expect(core).toContain('if-no-files-found: ignore');
    expect(core).toContain('retention-days: 14');
    expect(core).not.toContain('DerivedData');
    expect(core).not.toContain('xcresult');
  });

  it('retires the old parallel hosted quality workflows', () => {
    expect(fs.existsSync('.github/workflows/sync-sqlite-capability-gates.yml')).toBe(false);
    expect(fs.existsSync('scripts/ios/ios-bootstrap-quality-workflow-contract.test.mjs')).toBe(false);
    expect(fs.existsSync('.github/workflows/dev-push-health.yml')).toBe(false);
    expect(fs.existsSync('.github/workflows/windows-x64-ci.yml')).toBe(false);
  });
});
