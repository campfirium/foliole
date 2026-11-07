// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { admitPlaySubmission } from './play-admission.mjs';
import { preparePlaySubmission } from './play-preparation.mjs';
import { readPlayPreparation } from './play-preparation-state.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { submissionFixture } from './play-submission-test-fixture.mjs';

const open = [];
afterEach(async () => { for (const f of open.splice(0)) await f.close(); });
async function fixture() { const f = await submissionFixture(); open.push(f); f.release('IN_REVIEW'); return f; }
const prepare = (f, id = 42) => preparePlaySubmission({ ...f.clients(), env: f.env(id), registrarSha: 'e'.repeat(40) });
const creates = f => f.calls.filter(call => call.method === 'POST' && call.route === 'edits');

it('allows building while the old review remains intact and persists the code after deleting its inventory snapshot', async () => {
  const f = await fixture();
  expect(await prepare(f)).toMatchObject({ proceed: true, state: 'waiting', versionCode: 13 });
  expect(f.edits.size).toBe(0);
  expect(await readPlayPreparation(f.clients().github, f.rows[0])).toEqual({ phase: 'cleared', versionCode: 13 });
  expect((await readReservedPlayHistory(f.clients().github)).highestVersionCode).toBe(13);
  expect(f.releases[0].releaseLifecycleState).toBe('RELEASE_LIFECYCLE_STATE_IN_REVIEW');
  expect(f.calls.filter(call => call.method === 'PUT' || call.route.includes(':commit') || call.route.includes('uploadType'))).toEqual([]);
  expect(await prepare(f)).toMatchObject({ versionCode: 13 });
  expect(creates(f)).toHaveLength(1);
});

it('reserves a different code for the next accepted source without reusing the earlier reservation', async () => {
  const f = await fixture(); await prepare(f); f.addSource(43);
  expect(await prepare(f, 43)).toMatchObject({ versionCode: 14 });
  expect(await prepare(f)).toMatchObject({ versionCode: 13 });
  expect(f.rows).toHaveLength(2);
});

it('never creates another inventory snapshot after losing its creation response', async () => {
  const f = await fixture(); f.loseCreate = true;
  await expect(prepare(f)).rejects.toThrow(/unknown/u);
  await expect(prepare(f)).rejects.toThrow(/unknown/u);
  await expect(readReservedPlayHistory(f.clients().github)).rejects.toThrow(/unresolved/u);
  expect(creates(f)).toHaveLength(1);
});

it.each(['901', 'inventory+opaque-901'])('recovers cleanup of snapshot %s after a lost deletion response', async editId => {
  const f = await fixture(); f.nextUploadEditId = editId; f.loseDelete = true;
  await expect(prepare(f)).rejects.toThrow(/unknown/u);
  expect(await readPlayPreparation(f.clients().github, f.rows[0])).toEqual({ phase: 'open', editId, versionCode: 13 });
  expect(await prepare(f)).toMatchObject({ proceed: true, versionCode: 13 });
  expect(creates(f)).toHaveLength(1);
  const path = `edits/${encodeURIComponent(editId)}`;
  expect(f.calls.filter(call => call.method === 'DELETE').map(call => call.route)).toEqual([path, path]);
  expect(f.edits.size).toBe(0);
});

it('prepares a later source during review even when an older active legacy source has no allocated code', async () => {
  const f = await fixture();
  await admitPlaySubmission({ ...f.clients(), env: f.env(), registrarSha: 'e'.repeat(40) });
  f.addSource(43);
  expect(await prepare(f, 43)).toMatchObject({ proceed: true, versionCode: 13 });
  expect(creates(f)).toHaveLength(1);
  expect(f.releases[0].releaseLifecycleState).toBe('RELEASE_LIFECYCLE_STATE_IN_REVIEW');
  expect(f.reruns).toEqual([]);
  expect(f.rows[0].payload.prebuilt).toBeUndefined();
});
