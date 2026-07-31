// @vitest-environment node
/* global process */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowSource = fs.readFileSync('.github/workflows/t5-baseline-admission.yml', 'utf8');
const workflow = parse(workflowSource);
const movedScripts = [
  'test:release:desktop-src',
  'test:release:android',
  'test:release:shared',
  'test:desktop:electron',
  'quality:release:tooling'
];

function jobSection(jobName, nextJobName) {
  const start = workflowSource.indexOf(`  ${jobName}:`);
  const end = nextJobName ? workflowSource.indexOf(`  ${nextJobName}:`) : workflowSource.length;
  return workflowSource.slice(start, end);
}

describe('T5 Baseline Admission workflow contract', () => {
  it('is reusable-only and binds admission to an explicit lane, ref, and SHA', () => {
    const expectedInput = { required: true, type: 'string' };
    expect(workflow.on.workflow_call.inputs.target_sha).toEqual(expectedInput);
    expect(workflow.on.workflow_call.inputs.execution_lane).toEqual(expectedInput);
    expect(workflow.on.workflow_call.inputs.trigger_ref).toEqual(expectedInput);
    expect(workflow.on.workflow_dispatch).toBeUndefined();
    expect(workflow.on.workflow_call.outputs.admitted_sha.value)
      .toBe('${{ jobs.admission.outputs.admitted_sha }}');
    expect(workflow.name).toBe('T5 Baseline Admission');
    expect(workflow['run-name']).toBe(
      'T5 Baseline Admission (${{ inputs.execution_lane }}) @ ${{ inputs.target_sha }}'
    );
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency).toEqual({
      group: 't5-${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}-admission',
      'cancel-in-progress': false
    });
  });

  it('contains exactly the Ubuntu static and Windows core fast lanes', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['ubuntu-static', 'windows-core', 'admission']);
    expect(workflow.jobs['ubuntu-static']['runs-on']).toBe('ubuntu-latest');
    expect(workflow.jobs['windows-core']['runs-on']).toBe('windows-latest');
    for (const script of movedScripts) expect(workflowSource).not.toContain(script);
    expect(workflowSource.match(/quality:release:windows:core/gu)).toHaveLength(1);
    expect(workflowSource).not.toContain('matrix:');
    expect(workflowSource).not.toContain('paths:');
    expect(workflowSource).not.toContain('paths-ignore:');
    expect(workflowSource).not.toContain('changed-files');
  });

  it('rejects non-SHA inputs and verifies both checkouts before quality commands', () => {
    const staticJob = jobSection('ubuntu-static', 'windows-core');
    const windowsJob = jobSection('windows-core', 'admission');
    for (const job of [staticJob, windowsJob]) {
      expect(job).toContain('/^[0-9a-f]{40}$/');
      expect(job).toContain('ref: ${{ env.TARGET_SHA }}');
      expect(job).toContain('persist-credentials: false');
      expect(job).toContain("execFileSync('git', ['rev-parse', 'HEAD']");
      expect(job.indexOf('Validate target SHA input')).toBeLessThan(job.indexOf('Check out target snapshot'));
      expect(job.indexOf('run: npm ci')).toBeLessThan(job.indexOf('Verify checked-out target SHA'));
      expect(job.indexOf('Verify checked-out target SHA')).toBeLessThan(
        job.indexOf('run: npm run electron:rebuild:native')
      );
      expect(job.indexOf('run: npm run electron:rebuild:native')).toBeLessThan(
        job.indexOf('node scripts/electron-sqlite-runner.mjs --preflight')
      );
    }
    expect(workflowSource.match(/Validate target SHA input/gu)).toHaveLength(2);
    expect(workflowSource.match(/Verify checked-out target SHA/gu)).toHaveLength(2);
  });

  it('keeps the complete static and Windows core fast checks', () => {
    const staticJob = jobSection('ubuntu-static', 'windows-core');
    const windowsJob = jobSection('windows-core', 'admission');
    expect(staticJob).toContain('node scripts/quality/pinned-npm.mjs activate');
    expect(staticJob).toContain('npm run deps:hardening:check');
    expect(staticJob).toContain('bash scripts/quality/quality-gate-target.sh release-static');
    expect(windowsJob).toContain('npm run quality:release:windows:core');
    expect(windowsJob).not.toContain('${{ matrix.script }}');
  });

  it('caps both fast lanes at ten minutes and aggregates both results', () => {
    expect(workflow.jobs['ubuntu-static']['timeout-minutes']).toBe(10);
    expect(workflow.jobs['windows-core']['timeout-minutes']).toBe(10);
    expect(workflow.jobs.admission.needs).toEqual(['ubuntu-static', 'windows-core']);
    expect(workflow.jobs.admission.if).toBe('${{ always() }}');
    expect(workflow.jobs.admission.env).toEqual({
      STATIC_RESULT: '${{ needs.ubuntu-static.result }}',
      TARGET_SHA: '${{ inputs.target_sha }}',
      WINDOWS_RESULT: '${{ needs.windows-core.result }}'
    });
    const aggregateCommand = workflow.jobs.admission.steps[0].run;
    const success = spawnSync('bash', ['-c', aggregateCommand], {
      env: {
        ...process.env,
        GITHUB_OUTPUT: '/dev/null',
        STATIC_RESULT: 'success',
        TARGET_SHA: 'a'.repeat(40),
        WINDOWS_RESULT: 'success'
      }
    });
    const failure = spawnSync('bash', ['-c', aggregateCommand], {
      env: {
        ...process.env,
        GITHUB_OUTPUT: '/dev/null',
        STATIC_RESULT: 'success',
        TARGET_SHA: 'a'.repeat(40),
        WINDOWS_RESULT: 'failure'
      },
      encoding: 'utf8'
    });
    expect(success.status).toBe(0);
    expect(failure.status).toBe(1);
    expect(failure.stderr).toContain('WINDOWS_RESULT=failure');
    expect(workflow.jobs.admission.outputs.admitted_sha)
      .toBe('${{ steps.require-buckets.outputs.admitted_sha }}');
    expect(workflowSource.match(/npm run electron:rebuild:native/gu)).toHaveLength(2);
    expect(workflowSource.match(/node scripts\/electron-sqlite-runner\.mjs --preflight/gu)).toHaveLength(2);
    expect(workflowSource).not.toContain('continue-on-error');
  });

  it('excludes full aggregation, host acceptance, device work, signing, and publishing', () => {
    for (const excluded of [
      'build:vite-only',
      'electron:compile',
      'windows-ci-playwright-profile',
      'quality:release:windows:tail',
      'android:sync',
      'gradlew',
      'xcodebuild',
      'codesign',
      'npm run package',
      'npm run publish',
      'secrets.'
    ]) expect(workflowSource).not.toContain(excluded);
  });
});
