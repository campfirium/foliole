// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { recoverRejectedPlaySnapshot } from './play-preparation-recovery.mjs';
import { readPlayPreparation } from './play-preparation-state.mjs';
import { preparePlaySubmission } from './play-preparation.mjs';
import { submissionFixture } from './play-submission-test-fixture.mjs';

const fixtures = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.close(); });

async function startRejectedPreparation() {
  const fixture = await submissionFixture();
  fixtures.push(fixture);
  fixture.release('IN_REVIEW');
  fixture.singleEditPerAccount = true;
  fixture.loseCreate = true;
  const args = () => ({ ...fixture.clients(), env: fixture.env(), registrarSha: 'e'.repeat(40) });
  await expect(preparePlaySubmission(args())).rejects.toThrow(/outcome is unknown/u);
  const row = fixture.rows[0];
  const { runId, jobId, attempt, sourceSha, version } = row.payload;
  fixture.sources.get(runId).run.run_attempt += 1;
  const approval = { id: row.id, runId, jobId, attempt, sourceSha, version };
  return { fixture, args, recovery: { ...args(), row, approval } };
}

it('replaces one empty edit, verifies review unchanged and resumes the original reservation', async () => {
  const { fixture, args, recovery } = await startRejectedPreparation();
  expect(await recoverRejectedPlaySnapshot(recovery)).toBe(true);
  expect(fixture.edits.size).toBe(0);
  expect(await readPlayPreparation(recovery.github, recovery.row)).toEqual({ phase: 'cleared' });
  expect(await recoverRejectedPlaySnapshot(recovery)).toBe(false);
  expect(await preparePlaySubmission(args())).toMatchObject({ id: recovery.row.id, versionCode: 13 });
  expect(fixture.releases[0].releaseLifecycleState).toBe('RELEASE_LIFECYCLE_STATE_IN_REVIEW');
  expect(fixture.calls.filter(call => call.method === 'PUT' || call.route.includes(':commit') || call.route.includes('uploadType'))).toEqual([]);
});

it('does not replace an edit on a different attempt or after the replacement response is lost', async () => {
  const { fixture, recovery } = await startRejectedPreparation();
  await expect(recoverRejectedPlaySnapshot({ ...recovery, env: { ...recovery.env, GITHUB_RUN_ATTEMPT: '3' } })).rejects.toThrow(/approved/u);
  fixture.loseCreate = true;
  await expect(recoverRejectedPlaySnapshot(recovery)).rejects.toThrow(/outcome is unknown/u);
  await expect(recoverRejectedPlaySnapshot(recovery)).rejects.toThrow(/cannot be repeated/u);
  expect(fixture.calls.filter(call => call.method === 'POST' && call.route === 'edits')).toHaveLength(2);
});

it('does not clear the marker when the existing release inventory changes', async () => {
  const { fixture, recovery } = await startRejectedPreparation();
  const play = async (...args) => {
    const result = await recovery.play(...args);
    if (args[0] === 'DELETE') fixture.release('APPROVED_NOT_PUBLISHED');
    return result;
  };
  await expect(recoverRejectedPlaySnapshot({ ...recovery, play })).rejects.toThrow(/inventory changed/u);
  expect(await readPlayPreparation(recovery.github, recovery.row)).toMatchObject({ phase: 'open' });
});
