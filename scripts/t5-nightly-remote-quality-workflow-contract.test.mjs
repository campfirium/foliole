// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const core = fs.readFileSync('.github/workflows/hosted-quality-core.yml', 'utf8');
const remote = fs.readFileSync('.github/workflows/remote-quality.yml', 'utf8');
const t5 = fs.readFileSync('.github/workflows/t5-nightly-remote-quality.yml', 'utf8');
const handoffEvents = fs.readFileSync('scripts/github-desktop-handoff-events.mjs', 'utf8');

describe('hosted quality workflow contracts', () => {
  it('keeps T5 scheduled ownership separate from thread-owned Remote Quality', () => {
    expect(t5).toContain('name: T5 Nightly Remote Quality');
    expect(t5).toContain("cron: '40 3 * * *'");
    expect(t5).toContain("cron: '40 14 * * *'");
    expect(t5).toContain('uses: ./.github/workflows/hosted-quality-core.yml');
    expect(t5).toContain('scope: full');
    expect(remote).toContain('name: Remote Quality');
    expect(remote).toContain('workflow_dispatch:');
    expect(remote).not.toContain('schedule:');
    expect(handoffEvents).toContain("['T5 Nightly Remote Quality', 'T5']");
    expect(handoffEvents).not.toContain("['Remote Quality', 'T5']");
    expect(remote).toContain('Quality scope owned by the requesting development thread');
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
      'npm run quality:release:hosted-common', 'npm run quality:release:windows:core',
      'npm run quality:release:windows:tail',
      'npm run quality:release:android:tail', 'npm run quality:ios:contract',
      'npm run quality:ios:simulator:full'
    ]) expect(core).toContain(command);
    const commonSection = core.split('  common-quality:')[1].split('  windows-quality:')[0];
    expect(commonSection).toContain("inputs.scope == 'shared'");
    expect(commonSection).toContain('npm run quality:shared');
    expect(commonSection).toContain('npm run quality:release:hosted-common');
    const androidSection = core.split('  android-quality:')[1].split('  ios-contract:')[0];
    expect(androidSection).toContain("inputs.scope == 'android'");
    expect(androidSection).toContain('FOLIOLE_ANDROID_HOST_MODE: native-linux');
    expect(androidSection).toContain('npm run quality:android');
    expect(androidSection).toContain('npm run quality:release:android:tail');
    const contractSection = core.split('  ios-contract:')[1].split('  ios-simulator:')[0];
    expect(contractSection).toContain('npm run electron:rebuild:native');
    expect(contractSection).toContain('npm run quality:ios:contract');
    const simulatorSection = core.split('  ios-simulator:')[1];
    expect(simulatorSection).toContain('npm run electron:rebuild:native');
    expect(simulatorSection).toContain('npm run quality:ios:simulator:full');
    expect(simulatorSection).not.toContain('npm run quality:ios:contract');
  });

  it('binds checkout to an immutable SHA under read-only permissions', () => {
    expect(core.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(6);
    expect(core.match(/persist-credentials: false/gu)).toHaveLength(6);
    expect(core.match(/Verify target SHA/gu)).toHaveLength(6);
    for (const workflow of [core, remote, t5]) {
      expect(workflow).toContain('permissions:\n  contents: read');
      expect(workflow).not.toContain('contents: write');
      expect(workflow).not.toContain('secrets.');
    }
  });

  it('keeps scoped quality entry points and full host selection explicit', () => {
    for (const scope of ['desktop', 'shared', 'android', 'ios']) {
      expect(core).toContain(`inputs.scope == '${scope}'`);
    }
    for (const host of ['windows', 'android', 'ios']) {
      expect(core).toContain(`inputs.full_host == '${host}'`);
    }
  });

  it('uploads per-job logs without serial job dependencies', () => {
    for (const name of [
      'Common quality logs', 'Windows core evidence', 'Windows acceptance evidence',
      'Android quality logs', 'iOS contract logs', 'iOS Simulator evidence and logs'
    ]) expect(core).toContain(name);
    expect(core.match(/\.tmp\/logs\/quality-gate/gu)).toHaveLength(6);
    expect(core).not.toContain('\n    needs:');
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
