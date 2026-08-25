// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = (name) => parse(fs.readFileSync(`.github/workflows/${name}`, 'utf8'));

it('wires one non-gating terminal timing summary into Remote Quality and T7', () => {
  const summary = workflow('hosted-quality-timing-summary.yml');
  const remote = workflow('remote-quality.yml');
  const release = workflow('t7-release.yml');
  const remoteCall = remote.jobs['timing-summary'];
  const releaseCall = release.jobs.timing_summary;

  expect(remoteCall.if).toBe('${{ always() }}');
  expect(remoteCall.needs).toEqual(['dev-ref', 'scoped-quality', 't5-baseline', 'full-quality']);
  expect(releaseCall.if).toBe('${{ always() }}');
  expect(releaseCall.needs).toContain('assemble_draft');
  expect(remoteCall.uses).toBe('./.github/workflows/hosted-quality-timing-summary.yml');
  expect(releaseCall.uses).toBe(remoteCall.uses);
  expect(summary.permissions).toEqual({ actions: 'read', contents: 'read' });
  expect(summary.jobs.summary.steps.at(-2).if).toBe('${{ always() }}');
  expect(summary.jobs.summary.steps.at(-1)['continue-on-error']).toBe(true);
  expect(summary.jobs.summary.steps.at(-2).run).toContain('original quality conclusions are unchanged');
});

it('collects terminal API data without polling or external state', () => {
  const collector = fs.readFileSync('scripts/quality/hosted-quality-timing-collect.mjs', 'utf8');
  const analyzer = fs.readFileSync('scripts/quality/hosted-quality-timing.mjs', 'utf8');
  expect(collector).toContain('/actions/runs/${runId}/jobs');
  expect(collector).toContain("run.conclusion === 'success'");
  for (const rejected of ['setInterval', 'setTimeout', 'sqlite', 'database', 'daemon']) {
    expect(`${collector}\n${analyzer}`).not.toContain(rejected);
  }
});
