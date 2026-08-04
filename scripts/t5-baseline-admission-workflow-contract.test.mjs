// @vitest-environment node
/* global process */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const source = fs.readFileSync('.github/workflows/t5-baseline-admission.yml', 'utf8');
const workflow = parse(source);
const leafJobs = [
  'static-quality',
  'desktop-static',
  'dependency-hardening',
  'windows-core',
  'shared-tests',
  'android-source-tests',
  'desktop-source-tests',
  'electron-tests',
  'tooling-tests'
];
const leafOwners = {
  'android-source-tests': './.github/workflows/hosted-quality-portable-domain.yml',
  'desktop-source-tests': './.github/workflows/hosted-quality-desktop-source.yml',
  'desktop-static': './.github/workflows/hosted-quality-desktop-static.yml',
  'dependency-hardening': './.github/workflows/hosted-quality-dependency-hardening.yml',
  'electron-tests': './.github/workflows/hosted-quality-electron.yml',
  'shared-tests': './.github/workflows/hosted-quality-portable-domain.yml',
  'static-quality': './.github/workflows/hosted-quality-static.yml',
  'tooling-tests': './.github/workflows/hosted-quality-tooling.yml',
  'windows-core': './.github/workflows/hosted-quality-windows-core.yml'
};
const leafAdmissionEnv = {
  'android-source-tests': 'ANDROID_SOURCE',
  'desktop-source-tests': 'DESKTOP_SOURCE',
  'desktop-static': 'DESKTOP_STATIC',
  'dependency-hardening': 'DEPENDENCY',
  'electron-tests': 'ELECTRON',
  'shared-tests': 'SHARED',
  'static-quality': 'STATIC',
  'tooling-tests': 'TOOLING',
  'windows-core': 'WINDOWS_CORE'
};

describe('T5 Baseline Admission workflow contract', () => {
  it('is reusable-only and binds admission to an explicit lane, ref, and SHA', () => {
    const expectedInput = { required: true, type: 'string' };
    expect(workflow.on.workflow_call.inputs.target_sha).toEqual(expectedInput);
    expect(workflow.on.workflow_call.inputs.execution_lane).toEqual(expectedInput);
    expect(workflow.on.workflow_call.inputs.trigger_ref).toEqual(expectedInput);
    expect(workflow.on.workflow_dispatch).toBeUndefined();
    expect(workflow.on.workflow_call.outputs.admitted_sha.value)
      .toBe('${{ jobs.admission.outputs.admitted_sha }}');
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency).toEqual({
      group: 't5-${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}-admission',
      'cancel-in-progress': false
    });
  });

  it('selects every canonical leaf directly without inline or aggregate fallback', () => {
    expect(Object.keys(workflow.jobs)).toEqual([...leafJobs, 'admission']);
    for (const [jobName, owner] of Object.entries(leafOwners)) {
      const job = workflow.jobs[jobName];
      expect(job.uses).toBe(owner);
      expect(job.with.execution_lane).toBe('${{ inputs.execution_lane }}');
      expect(job.with.target_sha).toBe('${{ inputs.target_sha }}');
      expect(job.with.trigger_ref).toBe('${{ inputs.trigger_ref }}');
    }
    expect(workflow.jobs['shared-tests'].with.domain).toBe('shared');
    expect(workflow.jobs['android-source-tests'].with.domain).toBe('android-source');
    expect(source).not.toContain('runs-on: windows-latest');
    expect(source).not.toContain('runs-on: ${{ matrix.runner }}');
    expect(source).not.toContain('hosted-quality-portable.yml');
    expect(source).not.toContain('continue-on-error');
  });

  it('waits for every leaf and rejects any failed or mismatched result', () => {
    const admission = workflow.jobs.admission;
    expect(admission.if).toBe('${{ always() }}');
    expect(admission.needs).toEqual(leafJobs);
    for (const jobName of leafJobs) {
      const prefix = leafAdmissionEnv[jobName];
      expect(admission.env[`${prefix}_RESULT`]).toBe(`\${{ needs.${jobName}.result }}`);
      expect(admission.env[`${prefix}_SHA`]).toBe(`\${{ needs.${jobName}.outputs.accepted_sha }}`);
    }
    const command = admission.steps[0].run;
    const successEnv = Object.fromEntries(Object.keys(admission.env).map((key) => [
      key,
      key.endsWith('_RESULT') ? 'success' : 'a'.repeat(40)
    ]));
    const success = spawnSync('bash', ['-c', command], {
      env: { ...process.env, ...successEnv, GITHUB_OUTPUT: '/dev/null', GITHUB_SHA: 'b'.repeat(40) }
    });
    const failure = spawnSync('bash', ['-c', command], {
      encoding: 'utf8',
      env: { ...process.env, ...successEnv, GITHUB_OUTPUT: '/dev/null', SHARED_RESULT: 'failure' }
    });
    const mismatch = spawnSync('bash', ['-c', command], {
      encoding: 'utf8',
      env: { ...process.env, ...successEnv, GITHUB_OUTPUT: '/dev/null', TOOLING_SHA: 'b'.repeat(40) }
    });
    expect(success.status).toBe(0);
    expect(failure.status).toBe(1);
    expect(failure.stderr).toContain('SHARED_RESULT=failure');
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain('TOOLING_SHA=');
  });

  it('keeps T5 free of heavy host, package, device, signing, and publishing work', () => {
    for (const excluded of [
      'build:vite-only', 'electron:compile', 'windows-ci-playwright-profile',
      'quality:release:windows:tail', 'android:sync', 'gradlew', 'xcodebuild',
      'codesign', 'npm run package', 'npm run publish', 'secrets.', 'max-parallel'
    ]) expect(source).not.toContain(excluded);
  });
});
