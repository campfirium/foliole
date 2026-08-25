// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';
import { parse } from 'yaml';

const source = fs.readFileSync('.github/workflows/hosted-quality-tooling.yml', 'utf8');
const workflow = parse(source);
const targetSteps = fs.readFileSync('scripts/quality/quality-gate-target-steps.sh', 'utf8');

it('runs one complete Ubuntu lane and three lossless Windows buckets', () => {
  const matrix = workflow.jobs['tooling-tests'].strategy.matrix.include;
  const actual = matrix.flatMap(({ host, segments }) => (
    segments.map((segment) => `${host}:${segment}`)
  ));

  expect(actual).toEqual([
    'Ubuntu:full',
    'Windows:core-one',
    'Windows:core-two',
    'Windows:gate-one',
    'Windows:gate-two',
    'Windows:integration-one',
    'Windows:integration-two',
    'Windows:node-preview'
  ]);
  expect(new Set(actual).size).toBe(actual.length);
  expect(matrix).toHaveLength(4);
  expect(workflow.jobs['tooling-tests'].strategy['fail-fast']).toBe(false);
  expect(workflow.jobs['tooling-tests']['timeout-minutes']).toBe(20);
  expect(workflow.jobs['tooling-tests'].env.FOLIOLE_HOSTED_QUALITY_BUCKET_KIND).toBe('tooling');
  expect(source).toContain('node scripts/quality/hosted-quality-bucket.mjs');
  expect(source).not.toContain('--fileParallelism');
  for (const segment of actual.filter((entry) => entry.startsWith('Windows:'))
    .map((entry) => entry.split(':')[1])) {
    expect(targetSteps).toContain(segment);
  }
  expect(targetSteps).toContain('FOLIOLE_QUALITY_TOOLING_SEGMENT');
  expect(targetSteps).toContain('unset FOLIOLE_QUALITY_TOOLING_SEGMENT');
  expect(targetSteps).toContain('run_gate_steps test:quality:node test:quality:preview');
  expect(targetSteps).not.toContain('run_gate_steps_parallel test:quality:node test:quality:preview');
});

it('is reusable-only and admits only the exact SHA from every segment', () => {
  const inputs = workflow.on.workflow_call.inputs;
  const admission = workflow.jobs['tooling-admission'];

  expect(workflow.on.schedule).toBeUndefined();
  expect(workflow.on.workflow_dispatch).toBeUndefined();
  expect(inputs.target_sha).toEqual({ required: true, type: 'string' });
  expect(inputs.execution_lane).toEqual({ required: true, type: 'string' });
  expect(inputs.trigger_ref).toEqual({ required: true, type: 'string' });
  expect(workflow.on.workflow_call.outputs.accepted_sha.value)
    .toBe('${{ jobs.tooling-admission.outputs.accepted_sha }}');
  expect(admission.needs).toBe('tooling-tests');
  expect(admission.env.SEGMENT_RESULT).toBe('${{ needs.tooling-tests.result }}');
  expect(admission.steps[0].run).toContain('SEGMENT_RESULT !== "success"');
  expect(admission.steps[0].run).toContain('accepted_sha=${TARGET_SHA}');
});
