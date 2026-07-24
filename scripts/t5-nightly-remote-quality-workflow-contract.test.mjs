// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const core = fs.readFileSync('.github/workflows/hosted-quality-core.yml', 'utf8');
const common = fs.readFileSync('.github/workflows/hosted-quality-common.yml', 'utf8');
const ios = fs.readFileSync('.github/workflows/hosted-quality-ios.yml', 'utf8');
const remote = fs.readFileSync('.github/workflows/remote-quality.yml', 'utf8');
const t5 = fs.readFileSync('.github/workflows/t5-nightly-remote-quality.yml', 'utf8');
const handoffEvents = fs.readFileSync('scripts/github-desktop-handoff-events.mjs', 'utf8');

describe('hosted quality workflow contracts', () => {
  it('keeps T5 scheduled ownership separate from explicit Remote Quality', () => {
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
    expect(remote).toContain('Explicit recheck or release quality scope');
  });

  it('offers explicit Remote Quality scopes through the shared core', () => {
    for (const scope of ['desktop', 'shared', 'android', 'ios', 'full']) {
      expect(remote).toContain(`          - ${scope}`);
    }
    expect(remote).toContain('target_sha: ${{ inputs.target_sha }}');
    expect(remote).toContain('scope: ${{ inputs.scope }}');
  });

  it('serializes scheduled and explicit hosted quality without canceling either run', () => {
    for (const workflow of [remote, t5]) {
      expect(workflow).toContain('group: foliole-hosted-quality-${{ github.ref }}');
      expect(workflow).toContain('cancel-in-progress: false');
      expect(workflow).not.toContain('queue: max');
    }
    expect(remote).toContain('run-name: Remote Quality (${{ inputs.scope }}) @ ${{ inputs.target_sha }}');
    expect(t5).toContain('run-name: T5 Nightly Remote Quality @ ${{ inputs.target_sha || github.sha }}');
    expect(t5).toContain('actions: read');
    expect(t5).toContain('run: node scripts/quality/t5-remote-quality-admission.mjs');
    expect(t5).toContain("if: needs.admission.outputs.should_run == 'true'");
  });

  it('maps each scope to its canonical runner and target', () => {
    expect(core).toContain('runs-on: windows-latest');
    expect(core).toContain('runs-on: ubuntu-latest');
    expect(ios).toContain('runs-on: macos-15');
    for (const command of [
      'npm run quality:desktop', 'npm run quality:shared', 'npm run quality:android',
      'npm run quality:release:windows:core',
      'npm run quality:release:windows:tail',
      'npm run quality:release:android:tail', 'npm run quality:ios:contract',
      'node scripts/ios/ios-bootstrap-acceptance.mjs'
    ]) expect(`${core}\n${common}\n${ios}`).toContain(command);
    const commonSection = core.split('  common-quality:')[1].split('  windows-quality:')[0];
    expect(commonSection).toContain("inputs.scope == 'shared'");
    expect(commonSection).toContain('uses: ./.github/workflows/hosted-quality-common.yml');
    expect(common).toContain('run: npm run quality:shared');
    const androidSection = core.split('  android-quality:')[1].split('  ios-quality:')[0];
    expect(androidSection).toContain("inputs.scope == 'android'");
    expect(androidSection).toContain('FOLIOLE_ANDROID_HOST_MODE: native-linux');
    expect(androidSection).toContain('npm run quality:android');
    expect(androidSection).toContain('npm run quality:release:android:tail');
    expect(core).toContain('uses: ./.github/workflows/hosted-quality-ios.yml');
    const contractSection = ios.split('  contract:')[1].split('  simulator:')[0];
    expect(contractSection).toContain('npm run electron:rebuild:native');
    expect(contractSection).toContain('npm run quality:ios:contract');
    const simulatorSection = ios.split('  simulator:')[1];
    expect(simulatorSection).toContain('npm run electron:rebuild:native');
    expect(simulatorSection).toContain('node scripts/ios/ios-bootstrap-acceptance.mjs');
    expect(simulatorSection).not.toContain('npm run quality:ios:contract');
    expect(simulatorSection).toContain('fail-fast: false');
    expect(simulatorSection).toContain('max-parallel: 4');
    expect(simulatorSection).toContain('FOLIOLE_IOS_ACCEPTANCE_SCENARIO: ${{ matrix.scenario }}');
    expect(simulatorSection).toContain('FOLIOLE_IOS_RESOURCE_MODE: full');
    expect(simulatorSection).toContain('${{ inputs.target_sha }}-${{ matrix.scenario }}');
    expect(simulatorSection).toContain('ios-simulator-${{ matrix.scenario }}-${{ env.TARGET_SHA }}');
    for (const scenario of [
      'pairing-signed-transport', 'state-writeback-runtime',
      'sync-pack-runtime', 'foreground-sync-lifecycle'
    ]) expect(simulatorSection).toContain(`          - ${scenario}`);
  });

  it('binds checkout to an immutable SHA under read-only permissions', () => {
    expect(core.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(3);
    expect(common.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(4);
    expect(ios.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(2);
    expect(core.match(/persist-credentials: false/gu)).toHaveLength(3);
    expect(common.match(/persist-credentials: false/gu)).toHaveLength(4);
    expect(ios.match(/persist-credentials: false/gu)).toHaveLength(2);
    expect(core.match(/Verify target SHA/gu)).toHaveLength(3);
    expect(common.match(/Verify target SHA/gu)).toHaveLength(4);
    expect(ios.match(/Verify target SHA/gu)).toHaveLength(2);
    for (const workflow of [core, common, ios, remote, t5]) {
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

  it('stages Common tests before builds and keeps platform jobs independent', () => {
    for (const command of [
      'bash scripts/quality/quality-gate-target.sh release-static',
      'script: test:release:desktop-src',
      'script: test:release:android',
      'script: test:release:shared',
      'script: test:desktop:electron',
      'script: quality:release:tooling',
      'bash scripts/quality/quality-gate-target.sh release-hosted-common-build'
    ]) expect(common).toContain(command);
    expect(common).toContain('needs: full-static');
    expect(common).toContain('needs: full-tests');
    expect(common).toContain('hosted-quality-common-test-${{ inputs.target_sha }}-${{ matrix.domain }}');
    expect(common).toContain('common-test-${{ matrix.domain }}-${{ env.TARGET_SHA }}-${{ github.run_attempt }}');
    expect(core).toContain('needs: [common-quality, windows-quality]');
    const acceptance = core.split('  windows-acceptance:')[1].split('  android-quality:')[0];
    expect(acceptance).not.toContain('android-quality');
    expect(acceptance).not.toContain('ios-contract');
  });

  it('uploads logs for every stable hosted quality domain', () => {
    for (const name of [
      'Shared quality logs', 'Common static logs', 'Common test logs', 'Common build logs',
      'Windows core evidence', 'Windows acceptance evidence',
      'Android quality logs', 'iOS contract logs', 'iOS Simulator evidence and logs'
    ]) expect(`${core}\n${common}\n${ios}`).toContain(name);
    expect(core.match(/\.tmp\/logs\/quality-gate/gu)).toHaveLength(3);
    expect(common.match(/\.tmp\/logs\/quality-gate/gu)).toHaveLength(4);
    expect(ios.match(/\.tmp\/logs\/quality-gate/gu)).toHaveLength(2);
  });

  it('keeps only minimal per-scenario Simulator evidence', () => {
    for (const name of ['result.json', 'failure.json', 'evidence.json', 'simulator.log']) {
      expect(ios).toContain(`.tmp/artifacts/ios-bridge-acceptance/\${{ matrix.scenario }}/${name}`);
    }
    expect(ios).toContain('if-no-files-found: ignore');
    expect(ios).toContain('retention-days: 14');
    expect(ios).not.toContain('DerivedData');
    expect(ios).not.toContain('xcresult');
  });

  it('retires the old parallel hosted quality workflows', () => {
    expect(fs.existsSync('.github/workflows/sync-sqlite-capability-gates.yml')).toBe(false);
    expect(fs.existsSync('scripts/ios/ios-bootstrap-quality-workflow-contract.test.mjs')).toBe(false);
    expect(fs.existsSync('.github/workflows/dev-push-health.yml')).toBe(false);
    expect(fs.existsSync('.github/workflows/windows-x64-ci.yml')).toBe(false);
  });
});
