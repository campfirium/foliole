// @vitest-environment node
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { afterEach, expect, it } from 'vitest';
import { preparePlayCandidate } from './play-distribution.mjs';
import { admitPlaySubmission } from './play-admission.mjs';
import { resumePendingPlaySubmission } from './play-submission-queue.mjs';
import { readPlaySubmissionState, writePlaySubmissionState } from './play-submission-store.mjs';
import { submissionFixture } from './play-submission-test-fixture.mjs';

const fixtures = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.close(); });
async function fixture() { const f = await submissionFixture(); fixtures.push(f); return f; }
const admit = (f, id = 42) => admitPlaySubmission({ ...f.clients(), env: f.env(id), registrarSha: 'e'.repeat(40) });
const resume = f => resumePendingPlaySubmission(f.clients());

it('preserves the prior review, persists one waiting source and resumes only Android after publication across clients', async () => {
  const f = await fixture(); f.release('IN_REVIEW');
  expect(await admit(f)).toMatchObject({ proceed: false, state: 'waiting' });
  expect(await admit(f)).toMatchObject({ proceed: false, state: 'waiting' });
  expect(f.rows).toHaveLength(1);
  f.sources.get('42').run.status = 'completed'; f.sources.get('42').run.conclusion = 'success';
  expect(await resume(f)).toBe('waiting');
  f.release('APPROVED_NOT_PUBLISHED');
  expect(await resume(f)).toBe('waiting');
  f.release('PUBLISHED');
  expect(await resume(f)).toBe('resuming');
  expect(f.reruns).toEqual([4201]);
  expect(await resume(f)).toBe('resuming');
  expect(f.reruns).toEqual([4201]);
  expect(await admit(f)).toMatchObject({ proceed: true, state: 'admitted' });
  expect(await readPlaySubmissionState(f.clients().github, f.rows[0])).toBe('admitted');
  expect(f.calls.filter(call => call.method !== 'GET' && !call.route.startsWith('deployments') &&
    !call.route.startsWith('actions/jobs/'))).toEqual([]);
});

it('admits immediately when no review is pending, and keeps a second source behind the first', async () => {
  const f = await fixture(); f.release('PUBLISHED');
  expect(await admit(f)).toMatchObject({ proceed: true, state: 'admitted' });
  f.addSource(43);
  expect(await admit(f, 43)).toMatchObject({ proceed: false, state: 'waiting' });
  expect(f.rows[1].payload.predecessor).toBe(f.rows[0].id);
  expect(await resume(f)).toBe('admitted');
  expect(f.reruns).toEqual([]);
});

it('pauses on predecessor rejection, never bypasses it on later checks or manual admission', async () => {
  const f = await fixture(); f.release('IN_REVIEW'); await admit(f);
  f.sources.get('42').run.status = 'completed'; f.sources.get('42').run.conclusion = 'success';
  f.release('NOT_APPROVED');
  expect(await resume(f)).toBe('blocked');
  f.release('PUBLISHED');
  expect(await resume(f)).toBe('blocked');
  await expect(admitPlaySubmission({ ...f.clients(), env: f.env(), registrarSha: 'e'.repeat(40) })).rejects.toThrow();
  expect(f.reruns).toEqual([]);
});

it.each([true, false])('never duplicates a rerun after a lost response (server started=%s)', async started => {
  const f = await fixture(); f.release('IN_REVIEW'); await admit(f);
  Object.assign(f.sources.get('42').run, { status: 'completed', conclusion: 'success' });
  f.release('PUBLISHED'); f.lostDispatch = started; f.loseBeforeDispatch = !started;
  await expect(resume(f)).rejects.toThrow(/unknown/u);
  expect(await resume(f)).toBe(started ? 'resuming' : 'resume-outcome-unknown');
  expect(f.calls.filter(call => call.route === 'actions/jobs/4201/rerun')).toHaveLength(1);
});

it('recovers a lost queue-registration response without creating a second ticket', async () => {
  const f = await fixture(); f.release('IN_REVIEW'); f.lostRegistration = true;
  await expect(admit(f)).rejects.toThrow(/unknown/u);
  expect(await admit(f)).toMatchObject({ state: 'waiting' });
  expect(f.rows).toHaveLength(1);
});

it.each(['cancelled', 'timed_out'])('does not resume a %s source', async conclusion => {
  const f = await fixture(); f.release('IN_REVIEW'); await admit(f);
  Object.assign(f.sources.get('42').run, { status: 'completed', conclusion }); f.release('PUBLISHED');
  expect(await resume(f)).toBe('cancelled'); expect(f.reruns).toEqual([]);
});

it('keeps waiting on missing predecessors and rejects unknown states and expired quality without dispatch', async () => {
  const f = await fixture(); f.release('IN_REVIEW'); await admit(f);
  Object.assign(f.sources.get('42').run, { status: 'completed', conclusion: 'success' });
  f.releases = []; expect(await resume(f)).toBe('waiting');
  f.release('UNSPECIFIED'); await expect(resume(f)).rejects.toThrow(/Unknown/u);
  f.release('PUBLISHED'); f.sources.get('42').qualityArtifact.expired = true;
  await expect(resume(f)).rejects.toThrow(/expired/u); expect(f.reruns).toEqual([]);
});

it('rejects changed quality identity and keeps exact-candidate inspections read-only', async () => {
  const f = await fixture(); f.release('IN_REVIEW'); await admit(f);
  Object.assign(f.sources.get('42').run, { status: 'completed', conclusion: 'success' }); f.release('PUBLISHED');
  expect(await resumePendingPlaySubmission({ ...f.clients(), candidateId: '123' })).toBe('inspection-only');
  f.rows[0].payload.qualityArtifact.digest = `sha256:${'f'.repeat(64)}`;
  await expect(resume(f)).rejects.toThrow(/identity changed/u); expect(f.reruns).toEqual([]);
});

it('advances three accepted sources in order only after each original release is published', async () => {
  const f = await fixture();
  expect(await admit(f)).toMatchObject({ state: 'admitted' });
  await f.delivered(42, 4, 'IN_REVIEW');
  Object.assign(f.sources.get('42').run, { status: 'completed', conclusion: 'success' });
  for (const id of [43, 44]) { f.addSource(id); await admit(f, id);
    Object.assign(f.sources.get(String(id)).run, { status: 'completed', conclusion: 'success' }); }
  expect(await resume(f)).toBe('submitted'); expect(f.reruns).toEqual([]);
  f.releases[0].releaseLifecycleState = 'RELEASE_LIFECYCLE_STATE_PUBLISHED';
  expect(await resume(f)).toBe('resuming'); expect(f.reruns).toEqual([4301]);
  expect(await admit(f, 43)).toMatchObject({ proceed: true });
  await f.delivered(43, 5, 'IN_REVIEW');
  Object.assign(f.sources.get('43').run, { status: 'completed', conclusion: 'success' });
  expect(await resume(f)).toBe('submitted'); expect(f.reruns).toEqual([4301]);
  f.releases[0].releaseLifecycleState = 'RELEASE_LIFECYCLE_STATE_PUBLISHED';
  expect(await resume(f)).toBe('resuming'); expect(f.reruns).toEqual([4301, 4401]);
  expect(await admit(f, 44)).toMatchObject({ proceed: true });
});

it('routes the real workflow to successful waiting before its first Google edit or upload', async () => {
  const f = await fixture(); f.release('IN_REVIEW');
  const workflow = parse(readFileSync('.github/workflows/release-android.yml', 'utf8'));
  const result = workflow.jobs.play.needs === 'admission'
    ? await admit(f)
    : await preparePlayCandidate(f.clients().play, {}, { highestVersionCode: 3 });
  expect(result).toMatchObject({ proceed: false, state: 'waiting' });
  expect(f.calls.filter(call => call.route.includes('edits'))).toEqual([]);
});

it('requires accepted full Android quality and exact source identity before registering a queue ticket', async () => {
  for (const change of [f => { f.sources.get('42').run.head_repository.full_name = 'other/repo'; },
    f => { f.sources.get('42').jobs[0].conclusion = 'failure'; },
    f => { f.sources.get('42').run.display_title = 'Dev Quality Check (android)'; }]) {
    const f = await fixture(); change(f);
    await expect(admit(f)).rejects.toThrow(); expect(f.rows).toEqual([]);
  }
  const f = await fixture();
  await expect(admitPlaySubmission({ ...f.clients(), env: { ...f.env(), TARGET_SHA: 'f'.repeat(40) },
    registrarSha: 'e'.repeat(40) })).rejects.toThrow(/differs/u);
  expect(f.rows).toEqual([]);
});

it('recovers publication proof written before the initial waiting status and retires only explicitly abandoned requests', async () => {
  const f = await fixture(); f.release('IN_REVIEW'); await admit(f);
  const row = f.rows[0];
  f.histories.set(row.id, [{ description: 'Play predecessors: published', creator: { login: 'github-actions[bot]' } }]);
  expect(await readPlaySubmissionState(f.clients().github, row)).toBe('waiting');
  await writePlaySubmissionState(f.clients().github, row, 'retired');
  expect(await admit(f)).toMatchObject({ proceed: false, state: 'retired' });
  f.release('PUBLISHED'); f.addSource(43);
  expect(await admit(f, 43)).toMatchObject({ proceed: true });
  expect(f.reruns).toEqual([]);
});
