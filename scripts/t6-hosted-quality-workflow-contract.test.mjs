// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (file) => fs.readFileSync(file, 'utf8');
const hostedBucketRunner = read('scripts/quality/hosted-quality-bucket.mjs');
const sources = {
  android: read('.github/workflows/hosted-quality-android.yml'),
  androidHost: read('.github/workflows/hosted-quality-android-host.yml'),
  androidWebBuild: read('.github/workflows/hosted-quality-android-web-build.yml'),
  core: read('.github/workflows/hosted-quality-core.yml'),
  dependencyHardening: read('.github/workflows/hosted-quality-dependency-hardening.yml'),
  desktopBuild: read('.github/workflows/hosted-quality-desktop-build.yml'),
  desktopStatic: read('.github/workflows/hosted-quality-desktop-static.yml'),
  desktopSource: read('.github/workflows/hosted-quality-desktop-source.yml'),
  electron: read('.github/workflows/hosted-quality-electron.yml'),
  full: read('.github/workflows/hosted-quality-full.yml'),
  ios: read('.github/workflows/hosted-quality-ios.yml'),
  portableDomain: read('.github/workflows/hosted-quality-portable-domain.yml'),
  remote: read('.github/workflows/remote-quality.yml'),
  scopedStatic: read('.github/workflows/hosted-quality-scoped-static.yml'),
  shared: read('.github/workflows/hosted-quality-shared.yml'),
  static: read('.github/workflows/hosted-quality-static.yml'),
  t5: read('.github/workflows/t5-baseline-admission.yml'),
  t6: read('.github/workflows/t6-hosted-quality.yml'),
  tooling: read('.github/workflows/hosted-quality-tooling.yml'),
  windowsCore: read('.github/workflows/hosted-quality-windows-core.yml')
};
const workflows = Object.fromEntries(
  Object.entries(sources).map(([name, source]) => [name, parse(source)])
);

function section(source, jobName, nextJobName) {
  const start = source.indexOf(`  ${jobName}:`);
  const end = nextJobName ? source.indexOf(`  ${nextJobName}:`) : source.length;
  return source.slice(start, end);
}

describe('T6 hosted quality workflow contracts', () => {
  it('is reusable-only and exposes the exact admitted SHA', () => {
    const callInputs = workflows.t6.on.workflow_call.inputs;
    expect(workflows.t6.name).toBe('T6 Hosted Quality');
    expect(workflows.t6.on.schedule).toBeUndefined();
    expect(workflows.t6.on.workflow_dispatch).toBeUndefined();
    expect(callInputs.target_sha).toEqual({ required: true, type: 'string' });
    expect(callInputs.execution_lane).toEqual({ required: true, type: 'string' });
    expect(callInputs.trigger_ref).toEqual({ required: true, type: 'string' });
    expect(workflows.t6.on.workflow_call.outputs.accepted_sha.value)
      .toBe('${{ jobs.quality-admission.outputs.accepted_sha }}');
    expect(sources.t6).not.toContain('schedule:');
    expect(sources.t6).not.toContain('workflow_dispatch:');
    expect(sources.t6).not.toContain('hosted-quality-admission.mjs');
  });

  it('requires T5 before full quality and exports their exact shared SHA', () => {
    const baseline = workflows.t6.jobs['t5-baseline'];
    const full = workflows.t6.jobs['full-quality'];
    const gate = workflows.t6.jobs['quality-admission'];
    expect(baseline.uses).toBe('./.github/workflows/t5-baseline-admission.yml');
    expect(baseline.needs).toBe('context');
    expect(baseline.with.execution_lane).toBe('${{ needs.context.outputs.execution_lane }}');
    expect(full.uses).toBe('./.github/workflows/hosted-quality-full.yml');
    expect(full.needs).toEqual(['context', 't5-baseline']);
    expect(full.if).toBe("needs.t5-baseline.result == 'success'");
    expect(full.with.target_sha).toBe('${{ needs.t5-baseline.outputs.admitted_sha }}');
    expect(gate.needs).toEqual(['context', 't5-baseline', 'full-quality']);
    expect(gate.outputs.accepted_sha).toBe('${{ steps.require-chain.outputs.accepted_sha }}');
    expect(sources.t6).toContain('T5_SHA: ${{ needs.t5-baseline.outputs.admitted_sha }}');
    expect(sources.t6).toContain('FULL_SHA: ${{ needs.full-quality.outputs.accepted_sha }}');
    const admissionCommand = gate.steps[0].run.split('\n')[0];
    expect(admissionCommand).toMatch(/^node -e '.*'$/u);
    expect(admissionCommand).toContain('throw new Error(`${name}=${value}`)');
  });

  it('keeps dev Remote Quality outside formal T6/T7 evidence', () => {
    const remote = workflows.remote.jobs;
    const dispatch = workflows.remote.on.workflow_dispatch.inputs;
    expect(workflows.remote['run-name'])
      .toBe('Remote Quality (${{ inputs.scope }}) @ ${{ inputs.target_sha }} via ${{ github.sha }}');
    expect(dispatch.target_sha).toEqual({
      description: 'Exact commit SHA to validate with the current dev topology',
      required: true,
      type: 'string'
    });
    expect(remote['dev-ref'].steps[0].if).toBe("github.ref != 'refs/heads/dev'");
    expect(remote['dev-ref'].steps[1].env.TARGET_SHA).toBe('${{ inputs.target_sha }}');
    expect(remote['dev-ref'].steps[1].run).toContain('^[0-9a-f]{40}$');
    expect(remote['scoped-quality'].uses).toBe('./.github/workflows/hosted-quality-core.yml');
    expect(remote['scoped-quality'].with.execution_lane).toBe('dev-remote');
    expect(remote['scoped-quality'].with.trigger_ref).toBe('${{ github.ref }}');
    expect(remote['scoped-quality'].with.target_sha).toBe('${{ inputs.target_sha }}');
    expect(remote['t5-baseline'].uses).toBe('./.github/workflows/t5-baseline-admission.yml');
    expect(remote['t5-baseline'].with.target_sha).toBe('${{ inputs.target_sha }}');
    expect(remote['full-quality'].uses).toBe('./.github/workflows/hosted-quality-full.yml');
    expect(remote['full-quality'].with.target_sha)
      .toBe('${{ needs.t5-baseline.outputs.admitted_sha }}');
    for (const scope of ['desktop', 'shared', 'android', 'ios', 'full']) {
      expect(dispatch.scope.options).toContain(scope);
    }
  });

  it('preserves the complete heavy host and command union', () => {
    expect(Object.keys(workflows.core.jobs)).toEqual([
      'shared-quality', 'desktop-static', 'desktop-source-tests', 'desktop-shared-tests',
      'desktop-electron-tests', 'desktop-tooling-tests', 'desktop-windows-core',
      'desktop-dependency-hardening', 'desktop-build', 'linux-package-acceptance',
      'desktop-admission', 'android-quality', 'ios-quality'
    ]);
    expect(Object.keys(workflows.full.jobs)).toEqual([
      'desktop-build', 'android-web-build', 'windows-acceptance', 'android-host',
      'ios-full', 'full-admission'
    ]);
    expect(workflows.ios.jobs.contract.env.FOLIOLE_IOS_RESOURCE_MODE).toBe('full');
    const portableMatrix = workflows.portableDomain.jobs['portable-domain-tests'].strategy.matrix.include;
    expect(portableMatrix).toEqual([
      { host: 'Ubuntu', runner: 'ubuntu-latest' },
      { host: 'Windows', runner: 'windows-latest' }
    ]);
    expect(workflows.portableDomain.jobs['portable-domain-tests'].strategy['fail-fast']).toBe(false);
    const electronMatrix = workflows.electron.jobs['electron-tests'].strategy.matrix.include;
    const expectedElectronEntries = ['Ubuntu', 'Windows'].flatMap((host) => (
      ['database', 'import', 'ipc', 'services'].map((shard) => `${host}:${shard}`)
    ));
    const actualElectronEntries = electronMatrix.flatMap(({ host, shards }) => (
      shards.map((shard) => `${host}:${shard}`)
    ));
    expect(actualElectronEntries).toEqual(expectedElectronEntries);
    expect(new Set(actualElectronEntries).size).toBe(actualElectronEntries.length);
    expect(workflows.electron.jobs['electron-tests'].strategy['fail-fast']).toBe(false);
    expect(electronMatrix).toHaveLength(4);
    const desktopSourceMatrix = workflows.desktopSource.jobs['desktop-source-tests'].strategy.matrix.include;
    const expectedDesktopSourceEntries = ['Ubuntu', 'Windows'].flatMap((host) => (
      ['one', 'two', 'three', 'four'].map((shard) => `${host}:${shard}`)
    ));
    const actualDesktopSourceEntries = desktopSourceMatrix.flatMap(({ host, shards }) => (
      shards.map((shard) => `${host}:${shard}`)
    ));
    expect(actualDesktopSourceEntries)
      .toEqual(expectedDesktopSourceEntries);
    expect(new Set(actualDesktopSourceEntries).size).toBe(8);
    expect(desktopSourceMatrix).toHaveLength(3);
    expect(desktopSourceMatrix.filter(({ host }) => host === 'Windows').map(({ shards }) => shards))
      .toEqual([['one', 'two'], ['three', 'four']]);
    expect(sources.full).not.toContain('portable-quality');
    expect(sources.portableDomain).not.toContain('continue-on-error');
    expect(sources.portableDomain).not.toContain('paths:');
    expect(sources.portableDomain).not.toContain('paths-ignore:');
    expect(sources.portableDomain).not.toContain('changed-files');
    const hostSources = {
      Ubuntu: `${sources.static}\n${sources.scopedStatic}\n${sources.desktopStatic}\n${sources.dependencyHardening}\n${sources.portableDomain}\n${sources.desktopSource}\n${sources.electron}\n${sources.tooling}\n${hostedBucketRunner}\n${sources.desktopBuild}\n${sources.androidWebBuild}\n${sources.androidHost}`,
      Windows: `${sources.windowsCore}\n${sources.portableDomain}\n${sources.desktopSource}\n${sources.electron}\n${sources.tooling}\n${hostedBucketRunner}\n${section(sources.full, 'windows-acceptance', 'android-host')}`,
      macOS: sources.ios
    };
    const commands = {
      Ubuntu: [
        'release-static', 'test:release:desktop-src', 'test:release:android',
        'test:release:shared', 'test:desktop:electron', 'quality:release:tooling',
        'quality-gate-target.sh desktop-static', 'deps:hardening:check',
        'npm run build', 'electron:compile', 'android:web:build',
        'check-workspace-settings-boundary.mjs', 'quality:release:android:tail'
      ],
      Windows: [
        'test:release:desktop-src', 'test:release:android', 'test:release:shared',
        'test:desktop:electron', 'quality:release:tooling', 'quality:release:windows:core',
        'build:vite-only', 'electron:compile', 'quality:release:windows:tail',
        'windows-ci-playwright-profile.mjs'
      ],
      macOS: ['ios:sync:preflight', 'quality:ios:contract', 'ios-hosted-acceptance-bucket.mjs']
    };
    for (const [host, expected] of Object.entries(commands)) {
      for (const command of expected) expect(hostSources[host]).toContain(command);
    }
  });

  it('keeps full admission focused on heavy jobs after T5 owns portable quality', () => {
    const gate = workflows.full.jobs['full-admission'];
    expect(gate.needs).toEqual([
      'desktop-build', 'android-web-build', 'windows-acceptance', 'android-host', 'ios-full'
    ]);
    expect(gate.steps[0].env.PORTABLE_RESULT).toBeUndefined();
    expect(gate.steps[0].env.PORTABLE_SHA).toBeUndefined();
  });

  it('binds heavy jobs to one SHA and lane/ref-scoped concurrency groups', () => {
    for (const workflow of Object.values(workflows)) {
      expect(workflow.permissions).toMatchObject({ contents: 'read' });
    }
    for (const name of ['android', 'androidHost', 'androidWebBuild', 'core', 'dependencyHardening', 'desktopBuild',
      'desktopSource', 'desktopStatic', 'electron', 'full', 'ios', 'portableDomain',
      'scopedStatic', 'shared', 'static', 'tooling', 'windowsCore']) {
      expect(workflows[name].on.workflow_call.inputs.execution_lane)
        .toEqual({ required: true, type: 'string' });
      expect(workflows[name].on.workflow_call.inputs.trigger_ref)
        .toEqual({ required: true, type: 'string' });
    }
    const concurrencySources = `${sources.androidHost}\n${sources.androidWebBuild}\n${sources.core}\n${sources.desktopBuild}\n${sources.desktopStatic}\n${sources.dependencyHardening}\n${sources.full}\n${sources.ios}\n${sources.scopedStatic}\n${sources.tooling}`;
    expect(concurrencySources).toContain('${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}');
    expect(concurrencySources).not.toContain('group: hosted-quality-');
    expect(workflows.t6.concurrency.group)
      .toBe('t6-${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}-orchestrator');
    expect(sources.full.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(1);
    expect(sources.full.match(/persist-credentials: false/gu)).toHaveLength(1);
    for (const name of ['androidWebBuild', 'dependencyHardening', 'desktopBuild', 'desktopStatic']) {
      expect(sources[name].match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(1);
      expect(sources[name].match(/persist-credentials: false/gu)).toHaveLength(1);
    }
    expect(sources.portableDomain.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(1);
    expect(sources.portableDomain.match(/persist-credentials: false/gu)).toHaveLength(1);
    expect(sources.electron.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(1);
    expect(sources.electron.match(/persist-credentials: false/gu)).toHaveLength(1);
    expect(sources.desktopSource.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(1);
    expect(sources.desktopSource.match(/persist-credentials: false/gu)).toHaveLength(1);
    expect(sources.tooling.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(1);
    expect(sources.tooling.match(/persist-credentials: false/gu)).toHaveLength(1);
    expect(workflows.full.on.workflow_call.outputs.accepted_sha.value)
      .toBe('${{ jobs.full-admission.outputs.accepted_sha }}');
  });

  it('does not absorb packaging, signing, publishing, or polling', () => {
    for (const rejected of [
      'windows:package', 'installed-app-smoke', 'actions/attest', 'gh release',
      'CSC_', 'id-token: write', 'setTimeout', 'poll'
    ]) expect(`${sources.t6}\n${sources.full}\n${sources.androidWebBuild}\n${sources.desktopBuild}\n${sources.desktopStatic}\n${sources.dependencyHardening}\n${sources.portableDomain}\n${sources.desktopSource}\n${sources.electron}\n${sources.tooling}`).not.toContain(rejected);
    expect(fs.existsSync('.github/workflows/t5-nightly-remote-quality.yml')).toBe(false);
    expect(fs.existsSync('scripts/quality/t5-remote-quality-admission.mjs')).toBe(false);
  });
});
