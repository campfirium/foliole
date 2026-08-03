// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (file) => fs.readFileSync(file, 'utf8');
const sources = {
  common: read('.github/workflows/hosted-quality-common.yml'),
  core: read('.github/workflows/hosted-quality-core.yml'),
  desktopSource: read('.github/workflows/hosted-quality-desktop-source.yml'),
  electron: read('.github/workflows/hosted-quality-electron.yml'),
  full: read('.github/workflows/hosted-quality-full.yml'),
  ios: read('.github/workflows/hosted-quality-ios.yml'),
  portable: read('.github/workflows/hosted-quality-portable.yml'),
  remote: read('.github/workflows/remote-quality.yml'),
  t5: read('.github/workflows/t5-baseline-admission.yml'),
  t6: read('.github/workflows/t6-hosted-quality.yml'),
  tooling: read('.github/workflows/hosted-quality-tooling.yml')
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
  });

  it('keeps dev Remote Quality outside formal T6/T7 evidence', () => {
    const remote = workflows.remote.jobs;
    expect(remote['dev-ref'].steps[0].if).toBe("github.ref != 'refs/heads/dev'");
    expect(remote['scoped-quality'].uses).toBe('./.github/workflows/hosted-quality-core.yml');
    expect(remote['scoped-quality'].with.execution_lane).toBe('dev-remote');
    expect(remote['scoped-quality'].with.trigger_ref).toBe('${{ github.ref }}');
    expect(remote['t5-baseline'].uses).toBe('./.github/workflows/t5-baseline-admission.yml');
    expect(remote['full-quality'].uses).toBe('./.github/workflows/hosted-quality-full.yml');
    expect(remote['full-quality'].with.target_sha)
      .toBe('${{ needs.t5-baseline.outputs.admitted_sha }}');
    expect(workflows.remote.on.workflow_dispatch.inputs.target_sha).toBeUndefined();
    for (const scope of ['desktop', 'shared', 'android', 'ios', 'full']) {
      expect(workflows.remote.on.workflow_dispatch.inputs.scope.options).toContain(scope);
    }
  });

  it('preserves the complete heavy host and command union', () => {
    expect(Object.keys(workflows.core.jobs)).toEqual([
      'common-quality', 'windows-quality', 'linux-quality', 'android-quality', 'ios-quality'
    ]);
    expect(Object.keys(workflows.full.jobs)).toEqual([
      'portable-quality', 'common-build', 'windows-acceptance', 'android-host', 'ios-full',
      'full-admission'
    ]);
    expect(workflows.ios.jobs.contract.env.FOLIOLE_IOS_RESOURCE_MODE).toBe('full');
    const portableScripts = [
      'test:release:android',
      'test:release:shared'
    ];
    const portableMatrix = workflows.portable.jobs['portable-tests'].strategy.matrix.include;
    const expectedPortableEntries = ['Ubuntu', 'Windows'].flatMap((host) => (
      portableScripts.map((script) => `${host}:${script}`)
    ));
    const actualPortableEntries = portableMatrix.map(({ host, script }) => `${host}:${script}`);
    expect(actualPortableEntries).toEqual(expectedPortableEntries);
    expect(new Set(actualPortableEntries).size).toBe(actualPortableEntries.length);
    expect(workflows.portable.jobs['portable-tests'].strategy['fail-fast']).toBe(false);
    expect(new Set(portableMatrix.filter(({ host }) => host === 'Ubuntu')
      .map(({ runner }) => runner))).toEqual(new Set(['ubuntu-latest']));
    expect(new Set(portableMatrix.filter(({ host }) => host === 'Windows')
      .map(({ runner }) => runner))).toEqual(new Set(['windows-latest']));
    expect(portableMatrix.every(({ timeout_minutes }) => timeout_minutes === 20)).toBe(true);
    const electronMatrix = workflows.electron.jobs['electron-tests'].strategy.matrix.include;
    const expectedElectronEntries = ['Ubuntu', 'Windows'].flatMap((host) => (
      ['database', 'import', 'ipc', 'services'].map((shard) => `${host}:${shard}`)
    ));
    const actualElectronEntries = electronMatrix.map(({ host, shard }) => `${host}:${shard}`);
    expect(actualElectronEntries).toEqual(expectedElectronEntries);
    expect(new Set(actualElectronEntries).size).toBe(actualElectronEntries.length);
    expect(workflows.electron.jobs['electron-tests'].strategy['fail-fast']).toBe(false);
    expect(workflows.electron.jobs['electron-tests']['timeout-minutes']).toBe(20);
    const desktopSourceMatrix = workflows.desktopSource.jobs['desktop-source-tests'].strategy.matrix.include;
    const expectedDesktopSourceEntries = ['Ubuntu', 'Windows'].flatMap((host) => (
      ['one', 'two', 'three', 'four'].map((shard) => `${host}:${shard}`)
    ));
    expect(desktopSourceMatrix.map(({ host, shard }) => `${host}:${shard}`))
      .toEqual(expectedDesktopSourceEntries);
    expect(new Set(desktopSourceMatrix.map(({ host, shard }) => `${host}:${shard}`)).size).toBe(8);
    expect(`${sources.t6}\n${sources.full}\n${sources.portable}\n${sources.desktopSource}\n${sources.electron}\n${sources.tooling}\n${sources.remote}`)
      .not.toContain('quality:release:windows:core');
    expect(sources.t5.match(/quality:release:windows:core/gu)).toHaveLength(1);
    expect(sources.portable).not.toContain('continue-on-error');
    expect(sources.portable).not.toContain('paths:');
    expect(sources.portable).not.toContain('paths-ignore:');
    expect(sources.portable).not.toContain('changed-files');
    expect(workflows.full.jobs['portable-quality'].uses)
      .toBe('./.github/workflows/hosted-quality-portable.yml');
    expect(workflows.portable.jobs['electron-quality'].uses)
      .toBe('./.github/workflows/hosted-quality-electron.yml');
    expect(workflows.portable.jobs['desktop-source-quality'].uses)
      .toBe('./.github/workflows/hosted-quality-desktop-source.yml');
    expect(workflows.portable.jobs['tooling-quality'].uses)
      .toBe('./.github/workflows/hosted-quality-tooling.yml');
    const hostSources = {
      Ubuntu: `${sources.t5}\n${sources.portable}\n${sources.desktopSource}\n${sources.electron}\n${sources.tooling}\n${section(sources.full, 'common-build', 'windows-acceptance')}\n${section(sources.full, 'android-host', 'ios-full')}`,
      Windows: `${sources.t5}\n${sources.portable}\n${sources.desktopSource}\n${sources.electron}\n${sources.tooling}\n${section(sources.full, 'windows-acceptance', 'android-host')}`,
      macOS: sources.ios
    };
    const commands = {
      Ubuntu: [
        'release-static', 'test:release:desktop-src', 'test:release:android',
        'test:release:shared', 'test:desktop:electron', 'quality:release:tooling',
        'release-hosted-common-build', 'quality:release:android:tail'
      ],
      Windows: [
        'test:release:desktop-src', 'test:release:android', 'test:release:shared',
        'test:desktop:electron', 'quality:release:tooling', 'quality:release:windows:core',
        'build:vite-only', 'electron:compile', 'quality:release:windows:tail',
        'windows-ci-playwright-profile.mjs'
      ],
      macOS: ['ios:sync:preflight', 'quality:ios:contract', 'ios-bootstrap-acceptance.mjs']
    };
    for (const [host, expected] of Object.entries(commands)) {
      for (const command of expected) expect(hostSources[host]).toContain(command);
    }
  });

  it('makes full admission explicitly require the portable result and SHA', () => {
    const gate = workflows.full.jobs['full-admission'];
    expect(gate.needs).toEqual([
      'portable-quality', 'common-build', 'windows-acceptance', 'android-host', 'ios-full'
    ]);
    expect(gate.steps[0].env.PORTABLE_RESULT).toBe('${{ needs.portable-quality.result }}');
    expect(gate.steps[0].env.PORTABLE_SHA)
      .toBe('${{ needs.portable-quality.outputs.accepted_sha }}');
    expect(gate.steps[0].run).toContain('PORTABLE_SHA does not match full-quality target');
    expect(workflows.portable.on.workflow_call.outputs.accepted_sha.value)
      .toBe('${{ jobs.portable-admission.outputs.accepted_sha }}');
    expect(workflows.portable.jobs['portable-admission'].needs)
      .toEqual(['portable-tests', 'desktop-source-quality', 'electron-quality', 'tooling-quality']);
    expect(workflows.portable.jobs['portable-admission'].env.DESKTOP_SOURCE_RESULT)
      .toBe('${{ needs.desktop-source-quality.result }}');
    expect(workflows.portable.jobs['portable-admission'].env.DESKTOP_SOURCE_SHA)
      .toBe('${{ needs.desktop-source-quality.outputs.accepted_sha }}');
    expect(workflows.portable.jobs['portable-admission'].env.ELECTRON_RESULT)
      .toBe('${{ needs.electron-quality.result }}');
    expect(workflows.portable.jobs['portable-admission'].env.ELECTRON_SHA)
      .toBe('${{ needs.electron-quality.outputs.accepted_sha }}');
    expect(workflows.portable.jobs['portable-admission'].env.TOOLING_RESULT)
      .toBe('${{ needs.tooling-quality.result }}');
    expect(workflows.portable.jobs['portable-admission'].env.TOOLING_SHA)
      .toBe('${{ needs.tooling-quality.outputs.accepted_sha }}');
  });

  it('binds heavy jobs to one SHA and lane/ref-scoped concurrency groups', () => {
    for (const workflow of Object.values(workflows)) {
      expect(workflow.permissions).toMatchObject({ contents: 'read' });
    }
    for (const name of ['common', 'core', 'desktopSource', 'electron', 'full', 'ios', 'portable', 'tooling']) {
      expect(workflows[name].on.workflow_call.inputs.execution_lane)
        .toEqual({ required: true, type: 'string' });
      expect(workflows[name].on.workflow_call.inputs.trigger_ref)
        .toEqual({ required: true, type: 'string' });
    }
    const concurrencySources = `${sources.common}\n${sources.core}\n${sources.full}\n${sources.ios}\n${sources.tooling}`;
    expect(concurrencySources).toContain('${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}');
    expect(concurrencySources).not.toContain('group: hosted-quality-');
    expect(workflows.t6.concurrency.group)
      .toBe('t6-${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}-orchestrator');
    expect(sources.full.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(3);
    expect(sources.full.match(/persist-credentials: false/gu)).toHaveLength(3);
    expect(sources.portable.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(1);
    expect(sources.portable.match(/persist-credentials: false/gu)).toHaveLength(1);
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
    ]) expect(`${sources.t6}\n${sources.full}\n${sources.portable}\n${sources.desktopSource}\n${sources.electron}\n${sources.tooling}`).not.toContain(rejected);
    expect(fs.existsSync('.github/workflows/t5-nightly-remote-quality.yml')).toBe(false);
    expect(fs.existsSync('scripts/quality/t5-remote-quality-admission.mjs')).toBe(false);
  });
});
