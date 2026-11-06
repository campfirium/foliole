// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { preparePlaySubmission } from './play-preparation.mjs';
import { admitPlaySubmission } from './play-admission.mjs';
import { resumePendingPlaySubmission } from './play-submission-queue.mjs';
import { writeMobileCandidatePhase } from '../mobile/mobile-candidate-phase.mjs';
import { obsoleteSubmissionFixture, submissionArgs as args, writes } from './play-obsolete-submission-test-fixture.mjs';

const open = [];
afterEach(async () => { for (const f of open.splice(0)) await f.close(); });
async function fixture() { const f = await obsoleteSubmissionFixture(); open.push(f); return f; }
const bot = { login: 'github-actions[bot]' };
const status = (f, description, creator = bot) => f.histories.get(f.rows[0].id).unshift({ description, creator });
async function sign(f) {
  const prepared = await preparePlaySubmission(args(f)); f.saveSigned(43, prepared.versionCode);
}
const admit = f => admitPlaySubmission({ ...args(f), env: { ...f.env(43), PLAY_PREBUILT: 'true' } });
function noUpload(f) {
  expect(writes(f).filter(c => c.method === 'PUT' || c.route.includes('uploadType') || c.route.includes(':commit'))).toEqual([]);
  expect(f.reruns).toEqual([]);
}

it.each(['missing-job', 'started-job', 'active-run', 'signed', 'changed-source', 'earlier-attempt'])(
'prepares the new package but does not bypass %s evidence at upload', async fault => {
  const f = await fixture(); const source = f.sources.get('42');
  if (fault === 'missing-job') source.jobs.pop();
  if (fault === 'started-job') source.jobs.at(-1).conclusion = 'failure';
  if (fault === 'active-run') source.run.status = 'in_progress';
  if (fault === 'signed') f.saveSigned(42, 4);
  if (fault === 'changed-source') source.run.head_sha = 'f'.repeat(40);
  if (fault === 'earlier-attempt') {
    source.run.run_attempt = 2;
    source.attemptJobs = { 1: source.jobs.map(job => ({ ...job, conclusion: 'failure' })), 2: source.jobs };
  }
  await sign(f);
  if (fault === 'changed-source') await expect(admit(f)).rejects.toThrow(/registration refused/iu);
  else expect(await admit(f)).toMatchObject({ proceed: false, state: 'waiting' });
  noUpload(f);
});

it.each(['DRAFT', 'NOT_SENT_FOR_REVIEW', 'IN_REVIEW', 'APPROVED_NOT_PUBLISHED', 'NOT_APPROVED'])(
'prepares while the original Google release is %s and leaves upload gated', async lifecycle => {
  const f = await fixture(); f.release(lifecycle); await sign(f);
  expect(await admit(f)).toMatchObject({ proceed: false });
  noUpload(f);
});

it.each(['resuming:1', 'admitted', 'submitted', 'blocked'])('does not bypass an old %s operation at upload', async state => {
  const f = await fixture(); status(f, `Play submission: ${state}`); await sign(f);
  expect(await admit(f)).toMatchObject({ proceed: false });
  noUpload(f);
});

it('does not fall back past the latest untrusted operation to an older waiting state', async () => {
  const f = await fixture(); status(f, 'Play submission: waiting', { login: 'any-user' }); await sign(f);
  await expect(admit(f)).rejects.toThrow(/identity/iu);
  noUpload(f);
});

it('finds an unresolved rerun beyond the first status page', async () => {
  const f = await fixture(); status(f, 'Play submission: resuming:1');
  for (let i = 0; i < 101; i += 1) status(f, 'Unrelated note', { login: 'any-user' });
  await sign(f);
  Object.assign(f.sources.get('43').run, { status: 'completed', conclusion: 'success' });
  await expect(resumePendingPlaySubmission(f.clients())).rejects.toThrow(/unknown/iu);
  noUpload(f);
});

it.each(['creating', 'open'])('protects a %s inventory edit before preparing any new snapshot', async phase => {
  const f = await fixture();
  status(f, `Play preparation: ${JSON.stringify({ phase, editId: '901' })}`);
  await expect(preparePlaySubmission(args(f))).rejects.toThrow(/unresolved/iu);
  expect(writes(f).filter(c => c.route === 'edits')).toEqual([]);
  noUpload(f);
});

it.each(['upload-unknown', 'commit-unknown'])('preserves a registered %s result instead of preparing another edit', async phase => {
  const f = await fixture(); const registration = await f.delivered(42, 4, 'IN_REVIEW');
  await writeMobileCandidatePhase(f.clients().github, registration.id, { runId: '42', phase });
  f.releases = [];
  await expect(preparePlaySubmission(args(f))).rejects.toThrow(/unresolved/iu);
  expect(writes(f).filter(c => c.route === 'edits')).toEqual([]);
  noUpload(f);
});

it('does not skip the only original request without a later accepted source', async () => {
  const f = await fixture();
  expect(await resumePendingPlaySubmission(f.clients())).toBe('waiting');
  noUpload(f);
});

it('requires actual later quality before bypassing the old request at upload', async () => {
  const f = await fixture(); await sign(f); f.sources.get('43').qualityArtifact.expired = true;
  await expect(admit(f)).rejects.toThrow(/quality/iu);
  noUpload(f);
});
