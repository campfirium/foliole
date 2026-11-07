/* global structuredClone */
// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { checkRegisteredPlayAvailability } from './play-availability.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { checkPendingPlayCandidates, runPlayReviewCheck } from './play-review-check.mjs';
import { availabilityFixture } from './play-availability-test-fixture.mjs';

const open = [];
afterEach(async () => { await Promise.all(open.splice(0).map(f => f.close())); });
async function fixture() { const f = await availabilityFixture(); open.push(f); return f; }
const creates = f => f.calls.filter(call => call.method === 'POST' && call.route.endsWith('/edits'));
const result = f => f.histories.get(71).find(row => row.description.startsWith('Play availability: '))?.description;

it('continues from review across independent clients to complete availability after confirmed snapshot deletion', async () => {
  const f = await fixture();
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('waiting');
  expect(creates(f)).toHaveLength(0);
  f.lifecycle = 'PUBLISHED';
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('available');
  expect(f.edits.size).toBe(0);
  expect(f.histories.get(71).map(row => row.description)).toContain('Play snapshot: cleared');
  expect(f.calls.filter(call => call.route.includes('/edits')).map(call => call.method)).toEqual(['POST', 'GET', 'DELETE']);
  expect(f.calls.some(call => call.route.includes(':commit') || call.route.includes('/bundles') || call.method === 'PUT')).toBe(false);
  expect(result(f)).toBe('Play availability: available');
});

it.each(['IN_REVIEW', 'APPROVED_NOT_PUBLISHED', 'DRAFT', 'NOT_SENT_FOR_REVIEW', 'NOT_APPROVED'])(
  'does not create snapshots or mark %s available', async lifecycle => {
    const f = await fixture(); f.lifecycle = lifecycle;
    expect(await checkRegisteredPlayAvailability(f.clients())).toBe(lifecycle === 'NOT_APPROVED' ? 'rejected' : 'waiting');
    expect(creates(f)).toHaveLength(0);
  });

it.each([
  { status: 'halted' }, { status: 'inProgress', userFraction: 0.5 }, { status: 'draft' },
  { status: 'completed', userFraction: 1 }, { status: 'completed', countryTargeting: {} },
  { status: 'completed', versionCodes: ['3'] }, { status: 'completed', versionCodes: ['3', '4'] }
])('rejects incomplete or different distribution $status', async change => {
  const f = await fixture(); f.lifecycle = 'PUBLISHED'; Object.assign(f.track.releases[0], change);
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('waiting');
  expect(f.edits.size).toBe(0);
});

it('rejects a superseded candidate and a lifecycle change after the snapshot', async () => {
  const f = await fixture(); f.lifecycle = 'PUBLISHED';
  f.track.releases.push({ name: 'newer', versionCodes: ['5'], status: 'completed' });
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('waiting');
  f.track.releases.pop(); f.changeDuringRead = true;
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('waiting');
  f.absent = true;
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('waiting');
});

it('blocks a snapshot when another upload or commit outcome is unresolved', async () => {
  const f = await fixture(); f.lifecycle = 'PUBLISHED';
  const other = structuredClone(f.row); other.id = 72; f.rows.push(other);
  f.histories.set(72, [f.status('Play candidate: upload-unknown')]);
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/earlier Play operation/u);
  expect(creates(f)).toHaveLength(0);
});

it.each([undefined, 'upload-unknown', 'uploaded', 'commit-unknown', 'committed'])(
  'preserves an unfinished original delivery %s without adding misleading review history', async phase => {
    const f = await fixture(); f.lifecycle = 'PUBLISHED';
    f.histories.set(71, phase ? [f.status(`Play candidate: ${phase}`)] : []);
    expect(await checkRegisteredPlayAvailability(f.clients())).toBe('waiting');
    expect(await checkRegisteredPlayAvailability(f.clients())).toBe('waiting');
    expect(f.calls.some(call => call.method !== 'GET')).toBe(false);
  });

it('continues the same candidate after hundreds of persisted check results and refuses forged checkpoint ownership', async () => {
  const f = await fixture(); f.lifecycle = 'PUBLISHED';
  f.histories.get(71).unshift(...Array.from({ length: 205 }, () => f.status('Play availability: waiting')));
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('available');
  f.histories.get(71).unshift({ description: 'Play snapshot: creating', creator: { login: 'other-user' } });
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/identity differs/u);
  expect(creates(f)).toHaveLength(1);
});

it('performs no store calls when the durable candidate inventory is empty', async () => {
  const f = await fixture(); f.rows.length = 0;
  expect(await checkPendingPlayCandidates(f.clients())).toEqual([]);
  expect(f.calls.every(call => call.method === 'GET' && call.route.startsWith('/repos/'))).toBe(true);
});

it('persists unknown creation before POST and never retries it after a lost HTTP response', async () => {
  const f = await fixture(); f.lifecycle = 'PUBLISHED'; f.loseCreate = true;
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/outcome is unknown/u);
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/creation outcome is unknown/u);
  await expect(readReservedPlayHistory(f.clients().github)).rejects.toThrow(/snapshot remains unresolved/u);
  expect(creates(f)).toHaveLength(1);
  const createIndex = f.calls.indexOf(creates(f)[0]);
  expect(f.calls[createIndex - 1].body.description).toBe('Play snapshot: creating');
  expect(result(f)).toBe('Play availability: error');
});

it.each(['901', 'availability+opaque-901'])('recovers a lost deletion response for snapshot %s', async editId => {
  const f = await fixture(); f.nextEditId = editId; f.lifecycle = 'PUBLISHED'; f.loseDelete = true;
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/outcome is unknown/u);
  expect(result(f)).toBe('Play availability: error');
  expect(await checkRegisteredPlayAvailability(f.clients())).toBe('available');
  const deletes = f.calls.filter(call => call.method === 'DELETE');
  const originalPath = `/androidpublisher/v3/applications/com.campfirium.foliole.android/edits/${encodeURIComponent(editId)}`;
  expect(deletes.slice(0, 2).map(call => call.route)).toEqual([originalPath, originalPath]);
  expect(f.edits.size).toBe(0);
});

it.each(['Play snapshot: creating', 'Play snapshot: open:901', 'Play snapshot: cleared'])(
  'fails closed when checkpoint %s cannot be saved', async marker => {
    const f = await fixture(); f.lifecycle = 'PUBLISHED'; f.failStatus = marker;
    await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/HTTP 500/u);
    expect(result(f)).toBe('Play availability: error');
    expect(f.edits.size).toBe(0);
    if (marker.endsWith('creating')) expect(creates(f)).toHaveLength(0);
    expect(await checkRegisteredPlayAvailability(f.clients())).toBe('available');
  });

it('cleans up on API errors and rejects wrong track, release identity and unknown state', async () => {
  const f = await fixture(); f.lifecycle = 'PUBLISHED'; f.failTrack = true;
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/HTTP 403/u);
  expect(f.edits.size).toBe(0); f.failTrack = false; f.track.track = 'production';
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/snapshot is unavailable/u);
  f.track.track = 'beta'; f.releaseName = 'different';
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/identity differs/u);
  f.releaseName = '0.7.17.4.aaaaaaaaa'; f.lifecycle = 'UNKNOWN';
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/Unknown Play/u);
});

it('rejects duplicate exact releases and malformed version inventories while still deleting the snapshot', async () => {
  const f = await fixture(); f.lifecycle = 'PUBLISHED';
  f.track.releases.push({ ...f.track.releases[0] });
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/Ambiguous complete/u);
  expect(f.edits.size).toBe(0);
  f.track.releases[1] = { name: 'unknown', status: 'completed', versionCodes: ['unknown'] };
  await expect(checkRegisteredPlayAvailability(f.clients())).rejects.toThrow(/inventory is invalid/u);
  expect(f.edits.size).toBe(0);
});

it('ends scheduled waiting after readiness while allowing a manual exact-candidate refresh to revoke it', async () => {
  const f = await fixture();
  expect(await checkPendingPlayCandidates(f.clients())).toMatchObject([{ deploymentId: 71, state: 'waiting' }]);
  f.lifecycle = 'PUBLISHED';
  expect(await checkPendingPlayCandidates(f.clients())).toMatchObject([{ state: 'available' }]);
  const count = f.calls.length;
  expect(await checkPendingPlayCandidates(f.clients())).toEqual([]);
  expect(f.calls.slice(count).some(call => !call.route.startsWith('/repos/'))).toBe(false);
  f.track.releases[0].status = 'halted';
  expect(await checkPendingPlayCandidates({ ...f.clients(), candidateId: '71' })).toMatchObject([{ state: 'waiting' }]);
  await expect(checkPendingPlayCandidates({ ...f.clients(), candidateId: '72' })).rejects.toThrow(/not found/u);
});

it('refuses local execution and non-default or untrusted workflow events before external calls', async () => {
  await expect(runPlayReviewCheck({})).rejects.toThrow(/hosted-only/u);
  const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REF: 'refs/heads/check', GITHUB_EVENT_NAME: 'workflow_dispatch' };
  await expect(runPlayReviewCheck(env)).rejects.toThrow(/trusted default-branch/u);
  await expect(runPlayReviewCheck({ ...env, GITHUB_REF: 'refs/heads/dev', GITHUB_EVENT_NAME: 'pull_request' })).rejects.toThrow(/trusted default-branch/u);
});
