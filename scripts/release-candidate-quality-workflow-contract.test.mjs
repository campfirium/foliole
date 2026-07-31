// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const source = fs.readFileSync('.github/workflows/release-candidate-quality.yml', 'utf8');
const workflow = parse(source);

describe('release candidate quality workflow contract', () => {
  it('is a reusable-only same-run gate with one exact identity', () => {
    expect(workflow.name).toBe('Release Candidate Quality');
    expect(workflow.on.workflow_dispatch).toBeUndefined();
    expect(workflow.on.push).toBeUndefined();
    for (const input of ['target_version', 'target_sha', 'execution_lane', 'trigger_ref']) {
      expect(workflow.on.workflow_call.inputs[input]).toEqual({ required: true, type: 'string' });
    }
    expect(workflow.on.workflow_call.outputs.accepted_sha.value)
      .toBe('${{ jobs.release-candidate-quality.outputs.accepted_sha }}');
    expect(workflow.concurrency).toEqual({
      group: 'rc-${{ inputs.execution_lane }}-${{ inputs.trigger_ref }}-candidate',
      'cancel-in-progress': false
    });
  });

  it('asserts the release ref, event SHA, checkout, and package version', () => {
    expect(source).toContain('ref: ${{ inputs.target_sha }}');
    expect(source).toContain('persist-credentials: false');
    expect(source).toContain('TARGET_REF: ${{ inputs.trigger_ref }}');
    expect(source).toContain('RUN_SHA: ${{ github.sha }}');
    expect(source).toContain('TARGET_VERSION: ${{ inputs.target_version }}');
    expect(source).toContain('Checked out SHA does not match target SHA');
  });

  it('preserves the native preflight and desktop golden journey', () => {
    expect(source).toContain('runs-on: windows-latest');
    expect(source).toContain('run: npm ci');
    expect(source).toContain('npm run electron:rebuild:native');
    expect(source).toContain('node scripts/electron-sqlite-runner.mjs --preflight');
    expect(source).toContain('run: npm run test:e2e:desktop:rc-golden-journey');
    expect(source).not.toContain('continue-on-error: true');
  });

  it('stays read-only and produces no package or release artifact', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const rejected of ['contents: write', 'gh release', 'actions/upload-artifact', 'actions/attest']) {
      expect(source).not.toContain(rejected);
    }
  });
});
