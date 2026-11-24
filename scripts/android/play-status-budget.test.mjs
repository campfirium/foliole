/* global structuredClone */
// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { checkRegisteredPlayAvailability } from './play-availability.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { readPlaySnapshot } from './play-availability-state.mjs';
import { checkPendingPlayCandidates } from './play-review-check.mjs';
import { readPlaySnapshotReconciliations } from './play-snapshot-reconciliation.mjs';
import { availabilityFixture } from './play-availability-test-fixture.mjs';

const open = [];
afterEach(async () => { await Promise.all(open.splice(0).map(f => f.close())); });
async function fixture() { const f = await availabilityFixture(); open.push(f); return f; }
const creates = f => f.calls.filter(call => call.method === 'POST' && call.route.endsWith('/edits'));
const marker = { id: 22410715228, created_at: '2026-11-17T10:49:17Z', description: 'Play snapshot: creating',
  creator: { login: 'github-actions[bot]' } };

function addCandidate(f, id, versionCode, history) {
  const row = structuredClone(f.row); row.id = id; row.payload.candidate.versionCode = versionCode;
  f.rows.push(row); f.histories.set(id, history.map(item => typeof item === 'string' ? f.status(item) : item));
  return row;
}

it('refuses to create a snapshot edit when the deployment cannot record the whole round', async () => {
  const f = await fixture(); f.lifecycle = 'PUBLISHED';
  f.histories.get(71).push(...Array.from({ length: 94 }, () => f.status('Play availability: waiting')));
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/96 of 100 GitHub statuses.*no Play edit was created/u);
  expect(creates(f)).toHaveLength(0);
  expect(f.histories.get(71)).toHaveLength(96);
  f.histories.get(71).pop();
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('available');
  expect(f.histories.get(71)).toHaveLength(100);
});

it('does not rewrite unchanged waiting results on repeated checks', async () => {
  const f = await fixture();
  for (let run = 0; run < 3; run += 1) expect(await checkPendingPlayCandidates(f.clients())).toMatchObject([{ state: 'waiting' }]);
  expect(f.histories.get(71).map(row => row.description)).toEqual(['Play availability: waiting',
    'Play public status: in-review', 'Play review: IN_REVIEW', 'Play candidate: observed']);
});

it('treats only the exact authorized creating marker of a full deployment as cleared', async () => {
  const f = await fixture();
  const record = readPlaySnapshotReconciliations().find(item => item.deploymentId === 7728198485);
  expect(record).toMatchObject({ marker: 'creating', statusId: marker.id, statusCreatedAt: marker.created_at });
  expect(record.authorization).toMatch(/T853/u);
  f.rows.length = 0;
  addCandidate(f, 7728198485, 7, [marker, 'Play availability: checking', 'Play availability: available',
    'Play public status: available', 'Play review: PUBLISHED', 'Play candidate: observed',
    ...Array.from({ length: 94 }, () => 'Play snapshot: cleared')]);
  addCandidate(f, 7612796740, 4, ['Play availability: waiting', 'Play candidate: observed']);
  const { github } = f.clients();
  expect(await readPlaySnapshot(github, 7728198485)).toBe('cleared');
  await expect(readReservedPlayHistory(github)).resolves.toMatchObject({ highestVersionCode: 7 });
  f.lifecycle = 'PUBLISHED';
  f.extraReleases = [{ track: 'beta', releaseName: '0.7.17.7.aaaaaaaaa', activeArtifacts: [{ versionCode: 7 }],
    releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_PUBLISHED' }];
  expect(await checkPendingPlayCandidates(f.clients())).toEqual([]);
  expect(f.calls.filter(call => call.method !== 'GET')).toEqual([]);
  await expect(checkPendingPlayCandidates({ ...f.clients(), candidateId: '7728198485' }))
    .rejects.toThrow(/100 of 100 GitHub statuses/u);
  expect(creates(f)).toHaveLength(0);
  expect(f.calls.filter(call => call.method !== 'GET')).toEqual([]);
});

it.each([
  ['a newer status', history => history.unshift({ ...marker, id: marker.id + 1, description: 'Play review: PUBLISHED' })],
  ['a different status id', history => { history[0] = { ...marker, id: marker.id + 1 }; }],
  ['a different creation time', history => { history[0] = { ...marker, created_at: '2026-11-17T10:49:18Z' }; }],
  ['a different marker', history => { history[0] = { ...marker, description: 'Play snapshot: open:123' }; }]
])('keeps an unmatched reconciliation fail-closed after %s', async (_, change) => {
  const f = await fixture(); f.rows.length = 0;
  const history = [marker, 'Play candidate: observed'];
  addCandidate(f, 7728198485, 7, history); change(f.histories.get(7728198485));
  await expect(readReservedPlayHistory(f.clients().github)).rejects.toThrow(/snapshot remains unresolved/u);
});

it('never applies a reconciliation to another deployment carrying the same marker', async () => {
  const f = await fixture();
  f.histories.set(71, [marker, f.status('Play candidate: observed')]);
  expect(await readPlaySnapshot(f.clients().github, 71)).toBe('creating');
  await expect(readReservedPlayHistory(f.clients().github)).rejects.toThrow(/snapshot remains unresolved/u);
});

it('stops scheduled checks for older candidates once a newer candidate is available', async () => {
  const f = await fixture(); f.lifecycle = 'PUBLISHED';
  addCandidate(f, 72, 5, ['Play availability: available', 'Play public status: available', 'Play candidate: observed']);
  f.histories.set(71, [f.status('Play availability: waiting'), f.status('Play candidate: observed')]);
  expect(await checkPendingPlayCandidates(f.clients())).toEqual([]);
  expect(f.calls.filter(call => call.method !== 'GET')).toEqual([]);
});
