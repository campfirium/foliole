// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { preparePlaySubmission } from './play-preparation.mjs';
import { admitPlaySubmission, admitTrackResumeCandidate } from './play-admission.mjs';
import { readPrebuiltPlayCandidate } from './play-prebuilt-candidate.mjs';
import { resolvePlayDeliveryRegistration } from './play-deliver-runner.mjs';
import { deliverRegisteredPlayCandidate } from './play-delivery.mjs';
import { submissionFixture } from './play-submission-test-fixture.mjs';

const open = [];
afterEach(async () => { for (const f of open.splice(0)) await f.close(); });
async function prepared() {
  const f = await submissionFixture(); open.push(f); f.release('IN_REVIEW');
  const args = () => ({ ...f.clients(), env: f.env(), registrarSha: 'e'.repeat(40) });
  const preparation = await preparePlaySubmission(args());
  const bytes = f.saveSigned(42, preparation.versionCode);
  expect(await admitPlaySubmission({ ...args(), env: { ...f.env(), PLAY_PREBUILT: 'true' } }))
    .toMatchObject({ proceed: false });
  f.release('PUBLISHED');
  expect(await admitPlaySubmission({ ...args(), env: { ...f.env(), PLAY_PREBUILT: 'true' } }))
    .toMatchObject({ proceed: true });
  const payload = await readPrebuiltPlayCandidate(f.clients().github, f.rows[0]);
  const deliveryEnv = { ...f.env(), CANDIDATE_ARTIFACT: payload.signedArtifact.name };
  const registration = await resolvePlayDeliveryRegistration(f.clients().github, deliveryEnv, 'e'.repeat(40));
  const deliver = (loadBundle = async () => bytes) => deliverRegisteredPlayCandidate({ ...f.clients(), registration,
    loadBundle, notes: 'Prepared beta update' });
  return { f, bytes, registration, deliveryEnv, deliver };
}

it('uploads the original prebuilt archive with a fresh edit after publication and never rebuilds on recovery', async () => {
  const { f, registration, deliver } = await prepared();
  expect(registration.payload.candidate.editId).toBeUndefined();
  const result = await deliver();
  expect(result).toMatchObject({ schemaVersion: 2, phase: 'observed', releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' });
  expect(result.aabSha256).toBe(registration.payload.candidate.aabSha256);
  expect(await deliver()).toMatchObject({ phase: 'observed' });
  expect(f.uploads).toBe(1); expect(f.commits).toBe(1);
  expect(f.calls.filter(call => call.method === 'POST' && call.route === 'edits')).toHaveLength(2);
  expect(f.calls.find(call => call.route.includes(':commit')).route).toContain('changesInReviewBehavior=ERROR_IF_IN_REVIEW');
});

it.each(['loseUpload', 'loseCommit'])('recovers the same prebuilt archive after %s without another remote write', async fault => {
  const { f, registration, deliveryEnv, deliver } = await prepared(); f[fault] = true;
  await expect(deliver()).rejects.toThrow(/unknown/u);
  f.sources.get('42').signedArtifact.expired = true;
  expect((await resolvePlayDeliveryRegistration(f.clients().github, deliveryEnv, 'e'.repeat(40))).id).toBe(registration.id);
  expect(await deliver(() => { throw new Error('Expired signed archive must not be read'); })).toMatchObject({ phase: 'observed' });
  expect(f.uploads).toBe(1); expect(f.commits).toBe(1);
});

it('recovers a lost creation response before upload using the same original signed bundle', async () => {
  const { f, deliver } = await prepared(); f.loseCreate = true;
  await expect(deliver()).rejects.toThrow(/unknown/u);
  expect(f.uploads).toBeUndefined();
  expect(await deliver()).toMatchObject({ phase: 'observed' });
  expect(f.uploads).toBe(1);
  expect(f.calls.filter(call => call.method === 'POST' && call.route === 'edits')).toHaveLength(3);
});

it('refuses registration before upload when the signed source does not match its durable reserved number', async () => {
  const f = await submissionFixture(); open.push(f); f.release('IN_REVIEW');
  const preparation = await preparePlaySubmission({ ...f.clients(), env: f.env(), registrarSha: 'e'.repeat(40) });
  f.saveSigned(42, preparation.versionCode + 1);
  await expect(resolvePlayDeliveryRegistration(f.clients().github, { ...f.env(),
    CANDIDATE_ARTIFACT: f.sources.get('42').signedArtifact.name }, 'e'.repeat(40))).rejects.toThrow(/reservation/u);
  expect(f.rows).toHaveLength(1);
  expect(f.uploads).toBeUndefined();
});

it('admits only the verified waiting candidate while Play omits the old release', () => {
  const row = { id: 7617424538, payload: { predecessor: 7607351460, runId: '42342661860',
    sourceSha: '2bc09f0065e54a3bcbba3ed5e067307ac1abe350', version: '0.8.1', blockers: [] } };
  const context = { states: new Map([[row.id, 'waiting'], [row.payload.predecessor, 'submitted']]), releases: [] };
  expect(admitTrackResumeCandidate(row, context)).toBe(true);
  expect(admitTrackResumeCandidate({ ...row, id: row.id + 1 }, context)).toBe(false);
  expect(admitTrackResumeCandidate(row, { ...context, releases: [{}] })).toBe(false);
});
