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

function resultFromNeeds(job, results) {
  const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
  return needs.every((name) => results[name] === 'success') ? 'queued' : 'skipped';
}

describe('T6 hosted quality workflow contracts', () => {
  it('owns the twice-daily and exact-SHA full entry after duplicate suppression', () => {
    expect(workflows.t6.name).toBe('T6 Hosted Quality');
    expect(workflows.t6['run-name']).toBe('T6 Hosted Quality @ ${{ inputs.target_sha || github.sha }}');
    expect(workflows.t6.on.schedule.map(({ cron }) => cron)).toEqual(['40 3 * * *', '40 14 * * *']);
    expect(workflows.t6.on.workflow_dispatch.inputs.target_sha).toEqual({
      description: 'Exact dev commit to validate', required: true, type: 'string'
    });
    expect(workflows.t6.jobs['schedule-admission'].outputs.should_run)
      .toBe('${{ steps.admission.outputs.should_run }}');
    expect(sources.t6).toContain('run: node scripts/quality/t6-hosted-quality-admission.mjs');
    expect(admission).toContain('Remote Quality (full) @ ${targetSha}');
    expect(admission).toContain('actions/workflows/remote-quality.yml/runs?per_page=100');
  });

  it('starts the T6 heavy reusable workflow only after T5 succeeds', () => {
    const baseline = workflows.t6.jobs['t5-baseline'];
    const heavy = workflows.t6.jobs['full-quality'];
    expect(baseline.uses).toBe('./.github/workflows/t5-baseline-admission.yml');
    expect(baseline.needs).toBe('schedule-admission');
    expect(heavy.uses).toBe('./.github/workflows/hosted-quality-full.yml');
    expect(heavy.needs).toBe('t5-baseline');
    expect(heavy.if).toBe("needs.t5-baseline.result == 'success'");
    expect(resultFromNeeds(heavy, { 't5-baseline': 'failure' })).toBe('skipped');
    expect(resultFromNeeds(heavy, { 't5-baseline': 'success' })).toBe('queued');
  });

  it('keeps T4 scoped checks direct while composing the full T5 and T6 chain', () => {
    const refGuard = workflows.remote.jobs['dev-ref'];
    const scoped = workflows.remote.jobs['scoped-quality'];
    const baseline = workflows.remote.jobs['t5-baseline'];
    const full = workflows.remote.jobs['full-quality'];
    expect(refGuard.steps[0].if).toBe("github.ref != 'refs/heads/dev'");
    expect(scoped.if).toBe("inputs.scope != 'full' && needs.dev-ref.result == 'success'");
    expect(scoped.needs).toBe('dev-ref');
    expect(scoped.uses).toBe('./.github/workflows/hosted-quality-core.yml');
    expect(scoped.with.target_sha).toBe('${{ github.sha }}');
    expect(baseline.if).toBe("inputs.scope == 'full' && needs.dev-ref.result == 'success'");
    expect(baseline.needs).toBe('dev-ref');
    expect(baseline.uses).toBe('./.github/workflows/t5-baseline-admission.yml');
    expect(full.if).toBe("inputs.scope == 'full' && needs.t5-baseline.result == 'success'");
    expect(full.needs).toBe('t5-baseline');
    expect(full.uses).toBe('./.github/workflows/hosted-quality-full.yml');
    for (const scope of ['desktop', 'shared', 'android', 'ios', 'full']) {
      expect(workflows.remote.on.workflow_dispatch.inputs.scope.options).toContain(scope);
    }
    expect(workflows.remote.on.workflow_dispatch.inputs.target_sha).toBeUndefined();
    expect(workflows.remote['run-name']).toBe('Remote Quality (${{ inputs.scope }}) @ ${{ github.sha }}');
  });

  it('keeps the scoped core small and moves only full heavy work into the T6 tail', () => {
    expect(Object.keys(workflows.core.jobs)).toEqual([
      'common-quality', 'windows-quality', 'android-quality', 'ios-quality'
    ]);
    expect(Object.keys(workflows.full.jobs)).toEqual([
      'common-build', 'windows-acceptance', 'android-host', 'ios-full'
    ]);
    expect(Object.keys(workflows.common.jobs)).toEqual(['shared-quality']);
    expect(workflows.full.jobs['common-build'].needs).toBeUndefined();
    expect(sources.core).not.toContain("inputs.scope == 'full'");
    expect(sources.full).not.toContain('release-static');
    expect(sources.full).not.toContain('test:release:');
    expect(sources.full).not.toContain('quality:release:windows:core');
  });

  it('preserves the canonical command and host union across T5 plus T6', () => {
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
    for (const [host, expectedCommands] of Object.entries(commands)) {
      for (const command of expectedCommands) expect(hostSources[host]).toContain(command);
    }
    expect(workflows.full.jobs['common-build']['runs-on']).toBe('ubuntu-latest');
    expect(workflows.full.jobs['android-host']['runs-on']).toBe('ubuntu-latest');
    expect(workflows.full.jobs['windows-acceptance']['runs-on']).toBe('windows-latest');
    expect(sources.ios).toContain('runs-on: macos-15');
  });

  it('binds every heavy checkout to the requested SHA under read-only permissions', () => {
    for (const workflow of Object.values(workflows)) {
      expect(workflow.permissions).toMatchObject({ contents: 'read' });
    }
    expect(sources.full.match(/ref: \$\{\{ env\.TARGET_SHA \}\}/gu)).toHaveLength(3);
    expect(sources.full.match(/persist-credentials: false/gu)).toHaveLength(3);
    expect(sources.full.match(/Verify target SHA/gu)).toHaveLength(3);
    expect(workflows.full.jobs['ios-full'].with.target_sha).toBe('${{ inputs.target_sha }}');
    expect(sources.full).not.toContain('contents: write');
    expect(sources.full).not.toContain('secrets.');
  });

  it('does not absorb release-only or polling behavior', () => {
    for (const rejected of [
      'windows:package', 'installed-app-smoke', 'actions/attest', 'gh release',
      'CSC_', 'id-token: write', 'setTimeout', 'poll'
    ]) expect(`${sources.t6}\n${sources.full}`).not.toContain(rejected);
    expect(fs.existsSync('.github/workflows/t5-nightly-remote-quality.yml')).toBe(false);
    expect(fs.existsSync('scripts/quality/t5-remote-quality-admission.mjs')).toBe(false);
  });
});
