// @vitest-environment node
/* global process */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { GATE_INTEGRATION_SCRIPT_NAMES } from './script-test-bucket-selection.mjs';

const workflowSource = fs.readFileSync('.github/workflows/t5-baseline-admission.yml', 'utf8');
const workflow = parse(workflowSource);
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const targetSteps = fs.readFileSync('scripts/quality/quality-gate-target-steps.sh', 'utf8');

const portableScripts = [
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
  it('offers the same required target SHA input to reusable and manual callers', () => {
    const expectedInput = { required: true, type: 'string' };
    expect(workflow.on.workflow_call.inputs.target_sha).toEqual(expectedInput);
    expect(workflow.on.workflow_dispatch.inputs.target_sha).toEqual(expectedInput);
    expect(workflow.name).toBe('T5 Baseline Admission');
    expect(workflow['run-name']).toBe('T5 Baseline Admission @ ${{ inputs.target_sha }}');
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency).toEqual({
      group: 't5-baseline-admission-${{ inputs.target_sha }}',
      'cancel-in-progress': false
    });
  });

  it('runs Ubuntu static and the complete portable matrix without fail-fast cancellation', () => {
    const matrix = workflow.jobs['portable-tests'].strategy.matrix.include;
    expect(workflow.jobs['ubuntu-static']['runs-on']).toBe('ubuntu-latest');
    expect(workflow.jobs['portable-tests'].strategy['fail-fast']).toBe(false);
    expect(matrix.filter(({ host }) => host === 'Ubuntu').map(({ script }) => script)).toEqual(portableScripts);
    expect(matrix.filter(({ host }) => host === 'Windows').map(({ script }) => script)).toEqual([
      ...portableScripts,
      'quality:release:windows:core'
    ]);
    expect(new Set(matrix.filter(({ host }) => host === 'Ubuntu').map(({ runner }) => runner))).toEqual(
      new Set(['ubuntu-latest'])
    );
    expect(new Set(matrix.filter(({ host }) => host === 'Windows').map(({ runner }) => runner))).toEqual(
      new Set(['windows-latest'])
    );
    expect(workflowSource).not.toContain('paths:');
    expect(workflowSource).not.toContain('paths-ignore:');
    expect(workflowSource).not.toContain('changed-files');
  });

  it('rejects non-SHA inputs and verifies every checkout before quality commands', () => {
    const staticJob = jobSection('ubuntu-static', 'portable-tests');
    const testJob = jobSection('portable-tests', 'admission');
    for (const job of [staticJob, testJob]) {
      expect(job).toContain("/^[0-9a-f]{40}$/");
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

  it('preserves Common static, all quality tooling buckets, and dynamic integration scripts', () => {
    const staticJob = jobSection('ubuntu-static', 'portable-tests');
    const testJob = jobSection('portable-tests', 'admission');
    expect(staticJob).toContain('node scripts/quality/pinned-npm.mjs activate');
    expect(staticJob).toContain('npm run deps:hardening:check');
    expect(staticJob).toContain('bash scripts/quality/quality-gate-target.sh release-static');
    expect(testJob).toContain('run: npm run ${{ matrix.script }}');
    expect(packageJson.scripts['quality:release:tooling']).toBe(
      'node scripts/quality/quality-command-contracts.mjs allow quality:release:tooling && ' +
      'bash scripts/quality/quality-gate-target.sh release-tooling'
    );
    expect(targetSteps).toContain('release-tooling) run_release_tooling_gate_steps');
    expect(targetSteps).toContain('run_gate_steps_parallel test:quality:core test:quality:gate $(quality_gate_integration_scripts) test:quality:node');
    expect(GATE_INTEGRATION_SCRIPT_NAMES).toEqual([
      'test:quality:gate-integration:target-telemetry',
      'test:quality:gate-integration:target-collect',
      'test:quality:gate-integration:target-failures',
      'test:quality:gate-integration:routing',
      'test:quality:gate-integration:release-targets',
      'test:quality:gate-integration:fast-delegation',
      'test:quality:gate-integration:release-tail',
      'test:quality:gate-integration:target-core'
    ]);
    for (const script of GATE_INTEGRATION_SCRIPT_NAMES) {
      expect(packageJson.scripts[script]).toBeTruthy();
    }
  });

  it('keeps native setup inside the budget and aggregates all bucket results', () => {
    expect(workflow.jobs['ubuntu-static']['timeout-minutes']).toBe(20);
    expect(workflow.jobs['portable-tests']['timeout-minutes']).toBe(20);
    expect(workflow.jobs.admission.needs).toEqual(['ubuntu-static', 'portable-tests']);
    expect(workflow.jobs.admission.if).toBe('${{ always() }}');
    expect(workflow.jobs.admission.env).toEqual({
      STATIC_RESULT: '${{ needs.ubuntu-static.result }}',
      TEST_RESULT: '${{ needs.portable-tests.result }}'
    });
    const aggregateCommand = workflow.jobs.admission.steps[0].run;
    const success = spawnSync('bash', ['-c', aggregateCommand], {
      env: { ...process.env, STATIC_RESULT: 'success', TEST_RESULT: 'success' }
    });
    const failure = spawnSync('bash', ['-c', aggregateCommand], {
      env: { ...process.env, STATIC_RESULT: 'failure', TEST_RESULT: 'success' },
      encoding: 'utf8'
    });
    expect(success.status).toBe(0);
    expect(failure.status).toBe(1);
    expect(failure.stderr).toContain('STATIC_RESULT=failure');
    expect(workflowSource.match(/npm run electron:rebuild:native/gu)).toHaveLength(2);
    expect(workflowSource.match(/node scripts\/electron-sqlite-runner\.mjs --preflight/gu)).toHaveLength(2);
    expect(workflowSource).not.toContain('continue-on-error');
  });

  it('excludes product builds, host acceptance, device work, signing, and publishing', () => {
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
    ]) {
      expect(workflowSource).not.toContain(excluded);
    }
  });
});
