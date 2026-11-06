// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { preparePlaySubmission } from './play-preparation.mjs';
import { admitPlaySubmission } from './play-admission.mjs';
import { resumePendingPlaySubmission } from './play-submission-queue.mjs';
import { readPlayPreparation } from './play-preparation-state.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { obsoleteSubmissionFixture, submissionArgs as args, writes } from './play-obsolete-submission-test-fixture.mjs';

const open = [];
afterEach(async () => { for (const f of open.splice(0)) await f.close(); });
async function fixture() { const f = await obsoleteSubmissionFixture(); open.push(f); return f; }

it.each([undefined, 'retired', 'unrelated'])('prepares and admits only the later source with optional %s history', async history => {
  const f = await fixture();
  const old = f.rows[0]; const originalHistory = [...f.histories.get(old.id)];
  if (history) f.histories.get(old.id).unshift({ description: history === 'retired' ? 'Play submission: retired' : 'Unrelated note',
    creator: { login: 'any-user' } });
  const historyBefore = [...f.histories.get(old.id)];
  const prepared = await preparePlaySubmission(args(f));
  expect(prepared).toMatchObject({ proceed: true, versionCode: 13 });
  expect(await readPlayPreparation(f.clients().github, f.rows[1])).toEqual({ phase: 'cleared', versionCode: 13 });
  expect(await preparePlaySubmission(args(f))).toMatchObject({ versionCode: 13 });
  expect((await readReservedPlayHistory(f.clients().github)).highestVersionCode).toBe(13);
  f.saveSigned(43, prepared.versionCode);
  Object.assign(f.sources.get('43').run, { status: 'completed', conclusion: 'success' });
  expect(await resumePendingPlaySubmission(f.clients())).toBe('resuming');
  expect(f.reruns).toEqual([4302]);
  expect(await admitPlaySubmission({ ...args(f), env: { ...f.env(43), PLAY_PREBUILT: 'true' } }))
    .toMatchObject({ proceed: true, state: 'admitted' });
  expect(f.histories.get(old.id)).toEqual(historyBefore);
  expect(historyBefore).toEqual(expect.arrayContaining(originalHistory));
  expect(writes(f).filter(c => c.route === 'edits')).toHaveLength(1);
  expect(writes(f).filter(c => c.method === 'PUT' || c.route.includes('uploadType') || c.route.includes(':commit'))).toEqual([]);
  expect(writes(f).filter(c => c.route === `deployments/${old.id}/statuses`)).toHaveLength(1);
});

it('keeps a later pending Google review waiting even when the original blocker disappeared', async () => {
  const f = await fixture(); f.release('IN_REVIEW'); f.releases[0].releaseName = 'another-review'; f.releases[0].activeArtifacts = [{ versionCode: 9 }];
  const prepared = await preparePlaySubmission(args(f)); f.saveSigned(43, prepared.versionCode);
  expect(await admitPlaySubmission({ ...args(f), env: { ...f.env(43), PLAY_PREBUILT: 'true' } }))
    .toMatchObject({ proceed: false, state: 'waiting' });
  Object.assign(f.sources.get('43').run, { status: 'completed', conclusion: 'success' });
  expect(await resumePendingPlaySubmission(f.clients())).toBe('waiting');
  expect(f.reruns).toEqual([]);
});

it('does not revive an obsolete source when a later blocked successor still needs attention', async () => {
  const f = await fixture(); const prepared = await preparePlaySubmission(args(f)); f.saveSigned(43, prepared.versionCode);
  f.histories.get(f.rows[1].id).unshift({ description: 'Play submission: blocked', creator: { login: 'github-actions[bot]' } });
  await expect(resumePendingPlaySubmission(f.clients())).rejects.toThrow(/blocked/u);
  expect(f.reruns).toEqual([]);
});

it('still counts reserved version history on an unexecuted obsolete request', async () => {
  const f = await fixture();
  f.histories.get(f.rows[0].id).unshift({ description: 'Play preparation: {"phase":"cleared","versionCode":99}',
    creator: { login: 'github-actions[bot]' } });
  expect(await preparePlaySubmission(args(f))).toMatchObject({ versionCode: 100 });
});

it('finishes packaging during the original review and later uploads the same package without reviving the old run', async () => {
  const f = await fixture(); f.release('IN_REVIEW');
  const prepared = await preparePlaySubmission(args(f));
  f.saveSigned(43, prepared.versionCode);
  const hash = f.sources.get('43').candidate.aabSha256;
  const admission = () => admitPlaySubmission({ ...args(f), env: { ...f.env(43), PLAY_PREBUILT: 'true' } });
  expect(await admission()).toMatchObject({ proceed: false, state: 'waiting' });
  Object.assign(f.sources.get('43').run, { status: 'completed', conclusion: 'success' });
  expect(await resumePendingPlaySubmission(f.clients())).toBe('waiting');
  expect(f.reruns).toEqual([]);
  f.releases = [];
  expect(await resumePendingPlaySubmission(f.clients())).toBe('resuming');
  expect(await admission()).toMatchObject({ proceed: true, state: 'admitted' });
  expect(f.reruns).toEqual([4302]);
  expect(f.sources.get('43').candidate.aabSha256).toBe(hash);
  expect(writes(f).filter(c => c.route === 'edits')).toHaveLength(1);
});
