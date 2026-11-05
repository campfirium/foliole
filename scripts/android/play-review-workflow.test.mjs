// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/mobile-review-check.yml', 'utf8'));
const delivery = parse(readFileSync('.github/workflows/release-android.yml', 'utf8'));

it('serializes scheduled and manual checks with the entire upload without replacing queued deliveries', () => {
  expect(workflow.on.schedule).toEqual([{ cron: '17,47 * * * *' }]);
  expect(workflow.on.workflow_dispatch.inputs.candidate_id.required).toBe(false);
  expect(workflow.concurrency).toEqual(delivery.concurrency);
  expect(workflow.concurrency).toMatchObject({ 'cancel-in-progress': false, queue: 'max' });
  expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
});

it('gives only the trusted default branch checker state writes and exact-job continuation without candidate execution', () => {
  expect(workflow.permissions).toEqual({ contents: 'read' });
  const job = workflow.jobs.android;
  expect(job.if).toBe("github.ref == 'refs/heads/dev'");
  expect(job.permissions).toEqual({ contents: 'read', actions: 'write', deployments: 'write' });
  expect(job.timeout_minutes ?? job['timeout-minutes']).toBeLessThanOrEqual(10);
  expect(job.steps.filter(step => step.uses?.startsWith('actions/checkout@')).map(step => step.with))
    .toEqual([{ ref: 'dev', 'persist-credentials': false }]);
  expect(job.steps.filter(step => step.run).map(step => step.run)).toEqual(['node scripts/android/play-review-check.mjs']);
  expect(Object.keys(job.steps.at(-1).env).sort()).toEqual(['ANDROID_PLAY_SERVICE_ACCOUNT_JSON', 'CANDIDATE_ID', 'GH_TOKEN']);
});

it('gates the actual build on admission and keeps outer Android queues from cancelling older work', () => {
  const admission = delivery.jobs.admission;
  expect(admission.steps[0].with).toEqual({ ref: 'dev', 'persist-credentials': false });
  expect(admission.steps.at(-1).run).toBe('node scripts/android/play-admission.mjs');
  expect(admission.permissions).toEqual({ contents: 'read', actions: 'read', deployments: 'write' });
  expect(delivery.jobs.play.needs).toBe('admission');
  expect(delivery.jobs.play.if).toBe("needs.admission.outputs.proceed == 'true'");
  const formal = parse(readFileSync('.github/workflows/t7-release.yml', 'utf8'));
  expect(formal.concurrency).toMatchObject({ 'cancel-in-progress': false, queue: 'max' });
  expect(formal.jobs.assemble_draft.if).toContain("needs.android_package.outputs.submission_state == 'admitted'");
});
