// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (file) => fs.readFileSync(file, 'utf8');
const sources = {
  common: read('.github/workflows/hosted-quality-common.yml'),
  core: read('.github/workflows/hosted-quality-core.yml'),
  full: read('.github/workflows/hosted-quality-full.yml'),
  ios: read('.github/workflows/hosted-quality-ios.yml'),
  remote: read('.github/workflows/remote-quality.yml'),
  t5: read('.github/workflows/t5-baseline-admission.yml'),
  t6: read('.github/workflows/t6-hosted-quality.yml')
};
const workflows = Object.fromEntries(
  Object.entries(sources).map(([name, source]) => [name, parse(source)])
);
const admission = read('scripts/quality/t6-hosted-quality-admission.mjs');

function section(source, jobName, nextJobName) {
  const start = source.indexOf(`  ${jobName}:`);
  const end = nextJobName ? source.indexOf(`  ${nextJobName}:`) : source.length;
  return source.slice(start, end);
}

describe('T6 hosted quality workflow contracts', () => {
  it('keeps standalone dev schedule/manual entry and exposes the same reusable implementation', () => {
    const callInputs = workflows.t6.on.workflow_call.inputs;
    expect(workflows.t6.name).toBe('T6 Hosted Quality');
    expect(workflows.t6.on.schedule.map(({ cron }) => cron)).toEqual(['40 3 * * *', '40 14 * * *']);
    expect(workflows.t6.on.workflow_dispatch).toEqual(null);
    expect(callInputs.target_sha).toEqual({ required: true, type: 'string' });
    expect(callInputs.execution_lane).toEqual({ required: true, type: 'string' });
    expect(callInputs.trigger_ref).toEqual({ required: true, type: 'string' });
    expect(workflows.t6.on.workflow_call.outputs.accepted_sha.value)
      .toBe('${{ jobs.quality-admission.outputs.accepted_sha }}');
    expect(sources.t6).toContain("inputs.execution_lane == '' && github.ref != 'refs/heads/dev'");
    expect(sources.t6).toContain("github.event_name == 'schedule' && inputs.execution_lane == ''");
    expect(sources.t6).toContain('run: node scripts/quality/t6-hosted-quality-admission.mjs');
    expect(admission).toContain('actions/workflows/remote-quality.yml/runs?per_page=100');
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
    expect(workflows.remote.on.workflow_dispatch.inputs.target_sha).toBeUndefined();
    for (const scope of ['desktop', 'shared', 'android', 'ios', 'full']) {
      expect(workflows.remote.on.workflow_dispatch.inputs.scope.options).toContain(scope);
    }
  });

  it('preserves the complete heavy host and command union', () => {
    expect(Object.keys(workflows.core.jobs)).toEqual([
      'common-quality', 'windows-quality', 'android-quality', 'ios-quality'
    ]);
    expect(Object.keys(workflows.full.jobs)).toEqual([
      'common-build', 'windows-acceptance', 'android-host', 'ios-full', 'full-admission'
    ]);
    const hostSources = {
      Ubuntu: `${sources.t5}\n${section(sources.full, 'common-build', 'windows-acceptance')}\n${section(sources.full, 'android-host', 'ios-full')}`,
      Windows: `${sources.t5}\n${section(sources.full, 'windows-acceptance', 'android-host')}`,
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

  it('binds heavy jobs to one SHA and lane/ref-scoped concurrency groups', () => {
    for (const workflow of Object.values(workflows)) {
      expect(workflow.permissions).toMatchObject({ contents: 'read' });
    }
    for (const name of ['common', 'core', 'full', 'ios']) {
      expect(workflows[name].on.workflow_call.inputs.execution_lane)
        .toEqual({ required: true, type: 'string' });
      expect(workflows[name].on.workflow_call.inputs.trigger_ref)
        .toEqual({ required: true, type: 'string' });
    }
    const concurrencySources = `${sources.common}\n${sources.core}\n${sources.full}\n${sources.ios}`;
    expect(concurrencySources).toContain('${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}');
    expect(concurrencySources).not.toContain('group: hosted-quality-');
    expect(workflows.t6.concurrency.group)
      .toBe("t6-${{ inputs.execution_lane || 'dev-t6' }}-${{ inputs.trigger_ref || github.ref }}-orchestrator");
    expect(sources.full.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(3);
    expect(sources.full.match(/persist-credentials: false/gu)).toHaveLength(3);
    expect(workflows.full.on.workflow_call.outputs.accepted_sha.value)
      .toBe('${{ jobs.full-admission.outputs.accepted_sha }}');
  });

  it('does not absorb packaging, signing, publishing, or polling', () => {
    for (const rejected of [
      'windows:package', 'installed-app-smoke', 'actions/attest', 'gh release',
      'CSC_', 'id-token: write', 'setTimeout', 'poll'
    ]) expect(`${sources.t6}\n${sources.full}`).not.toContain(rejected);
    expect(fs.existsSync('.github/workflows/t5-nightly-remote-quality.yml')).toBe(false);
    expect(fs.existsSync('scripts/quality/t5-remote-quality-admission.mjs')).toBe(false);
  });
});
