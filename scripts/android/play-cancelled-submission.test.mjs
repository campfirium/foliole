// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { admitPlaySubmission } from './play-admission.mjs';
import { preparePlaySubmission } from './play-preparation.mjs';
import { resumePendingPlaySubmission } from './play-submission-queue.mjs';
import { writePlaySubmissionState } from './play-submission-store.mjs';
import { submissionArgs as args, writes } from './play-obsolete-submission-test-fixture.mjs';
import { submissionFixture } from './play-submission-test-fixture.mjs';

const open = [];
afterEach(async () => { for (const f of open.splice(0)) await f.close(); });

async function cancelledFixture(predecessorState) {
  const f = await submissionFixture();
  open.push(f);
  if (predecessorState) {
    f.addSource(41);
    await admitPlaySubmission(args(f, 41));
    await writePlaySubmissionState(f.clients().github, f.rows[0], predecessorState);
  }
  const prepared = await preparePlaySubmission(args(f, 42));
  const row = f.rows.at(-1);
  const source = f.sources.get('42');
  Object.assign(source.run, { status: 'completed', conclusion: 'cancelled' });
  Object.assign(source.jobs.find(job => job.id === 4202), {
    status: 'completed', conclusion: 'cancelled', runner_id: null, steps: []
  });
  source.jobs.push(...['Build and sign the original Android candidate', 'Deliver the durable Android candidate']
    .map(name => ({ name: `mobile-android / ${name}`, status: 'completed', conclusion: 'cancelled',
      runner_id: null, steps: [] })));
  f.addSource(43);
  return { f, row, source, versionCode: prepared.versionCode };
}

const admit = f => admitPlaySubmission({ ...args(f), env: { ...f.env(43), PLAY_PREBUILT: 'true' } });
async function prepareNext(f) {
  const next = await preparePlaySubmission(args(f));
  f.saveSigned(43, next.versionCode);
  return next;
}

it.each([false, true])('admits only the later accepted source with prior checker observation %s', async observed => {
  const { f, row, versionCode } = await cancelledFixture('published');
  if (observed) await expect(resumePendingPlaySubmission(f.clients())).rejects.toThrow(/cancelled/u);
  const history = [...f.histories.get(row.id)];
  const next = await prepareNext(f);
  expect(next.versionCode).toBeGreaterThan(versionCode);
  expect(await admit(f)).toMatchObject({ proceed: true, state: 'admitted' });
  expect(f.reruns).toEqual([]);
  expect(f.histories.get(row.id)).toEqual(history);
});

it('dispatches only the later accepted source through scheduled continuation', async () => {
  const { f, row } = await cancelledFixture();
  const history = [...f.histories.get(row.id)];
  await prepareNext(f);
  Object.assign(f.sources.get('43').run, { status: 'completed', conclusion: 'success' });
  expect(await resumePendingPlaySubmission(f.clients())).toBe('resuming');
  expect(f.reruns).toEqual([4302]);
  expect(f.histories.get(row.id)).toEqual(history);
});

it.each(['started', 'upload-admission-started', 'runner-assigned', 'missing-steps', 'missing-job', 'signed', 'prior-attempt', 'resuming', 'timed-out'])(
  'preserves the original queue when there is %s evidence', async fault => {
    const { f, row, source, versionCode } = await cancelledFixture();
    if (fault === 'started') source.jobs.at(-1).steps = [{ name: 'Set up job' }];
    if (fault === 'upload-admission-started') source.jobs.find(job => job.id === 4202).steps = [{ name: 'Set up job' }];
    if (fault === 'runner-assigned') source.jobs.at(-1).runner_id = 1;
    if (fault === 'missing-steps') delete source.jobs.at(-1).steps;
    if (fault === 'missing-job') source.jobs.pop();
    if (fault === 'signed') f.saveSigned(42, versionCode);
    if (fault === 'prior-attempt') {
      source.run.run_attempt = 2;
      source.attemptJobs = { 1: source.jobs.map(job => ({ ...job, conclusion: 'failure' })), 2: source.jobs };
    }
    if (fault === 'resuming') await writePlaySubmissionState(f.clients().github, row, 'resuming:1');
    if (fault === 'timed-out') source.run.conclusion = 'timed_out';
    await prepareNext(f);
    expect(await admit(f)).toMatchObject({ proceed: false, state: 'waiting' });
    expect(f.reruns).toEqual([]);
  });

it('retains a rejected queue predecessor across the cancelled source', async () => {
  const { f } = await cancelledFixture('blocked');
  await prepareNext(f);
  expect(await admit(f)).toMatchObject({ proceed: false, state: 'blocked' });
});

it('retains a current Play review across the cancelled source', async () => {
  const { f } = await cancelledFixture();
  f.release('IN_REVIEW');
  await prepareNext(f);
  expect(await admit(f)).toMatchObject({ proceed: false, state: 'waiting' });
  expect(f.reruns).toEqual([]);
});

it('protects an unresolved preparation before opening any new edit', async () => {
  const { f, row } = await cancelledFixture();
  f.histories.get(row.id).unshift({ description: 'Play preparation: {"phase":"creating"}',
    creator: { login: 'github-actions[bot]' } });
  f.calls.length = 0;
  await expect(prepareNext(f)).rejects.toThrow(/unresolved/u);
  expect(writes(f).filter(call => call.route === 'edits')).toEqual([]);
});

it('requires a fresh quality archive for a successor without durable registration', async () => {
  const { f } = await cancelledFixture();
  await prepareNext(f);
  f.sources.get('43').qualityArtifact.expired = true;
  await expect(admit(f)).rejects.toThrow(/quality/u);
  expect(f.reruns).toEqual([]);
});

it('keeps a delivered successor verifiable after its quality archive expires', async () => {
  const { f } = await cancelledFixture();
  const next = await prepareNext(f);
  expect(await admit(f)).toMatchObject({ proceed: true, state: 'admitted' });
  Object.assign(f.sources.get('43').run, { status: 'completed', conclusion: 'success' });
  await f.delivered(43, next.versionCode, 'PUBLISHED');
  f.sources.get('43').qualityArtifact.expired = true;
  expect(await resumePendingPlaySubmission(f.clients())).toBe('idle');
  expect(f.reruns).toEqual([]);
});
