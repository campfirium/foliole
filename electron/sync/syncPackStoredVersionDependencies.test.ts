// @vitest-environment node
import { expect, it } from 'vitest';

import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { branch, business, identity, receive } from './syncPackStoredVersionDependencies.testSupport.js';

const parent = branch('parent', 'parent body', undefined, '2026-05-01T00:00:00.000Z');
const child = branch('child', 'child body', parent, '2026-05-02T00:00:00.000Z');
async function scenario(run: (source: RestorePeer, target: RestorePeer) => Promise<void>) {
  const fixture = await restoreFixture();
  try { await run(fixture.peer('source'), fixture.peer('target')); } finally { await fixture.close(); }
}

it('accepts a parent omitted from the response when the receiver has its body', () => scenario(async (source, target) => {
  await receive(source, target, [parent]);
  await receive(source, target, [child]); target.reopen();
  expect(target.sqlite.prepare('SELECT version_id, parent_version_id FROM node_sync_version_parents').all())
    .toEqual([{ version_id: 'child', parent_version_id: 'parent' }]);
  expect(target.sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([{ version_id: 'child' }, { version_id: 'parent' }]);
}));

it('accepts an omitted parent identity whose stored body has been reclaimed', () => scenario(async (source, target) => {
  await upsertRemoteVersion(target.db, identity(parent));
  const original = target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'parent'").get();
  await receive(source, target, [child]); target.reopen();
  expect(target.sqlite.prepare("SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = 'child'").get())
    .toEqual({ parent_version_id: 'parent' });
  expect(target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'parent'").get()).toEqual(original);
  expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'parent'").get()).toEqual({ body_text: null });
}));

it('preserves a legacy parent pointer to a retained identity without its body', () => scenario(async (source, target) => {
  await upsertRemoteVersion(target.db, identity(parent));
  const legacy = { ...child };
  delete legacy.parent_version_ids;
  await receive(source, target, [legacy]); target.reopen();
  expect(target.sqlite.prepare("SELECT parent_version_id FROM node_sync_versions WHERE version_id = 'child'").get())
    .toEqual({ parent_version_id: 'parent' });
}));

it('rejects a missing historical parent without inventing its identity, body or a dangling edge', () => scenario(async (source, target) => {
  const before = business(target);
  await expect(receive(source, target, [child])).rejects.toThrow('node_version_missing_parents:parent');
  target.reopen(); expect(business(target)).toEqual(before);
}));

it('requires the current body before accepting an object containing only ancestry', () => scenario(async (source, target) => {
  await upsertRemoteVersion(target.db, identity(parent));
  const before = business(target);
  await expect(receive(source, target, [identity(parent)])).rejects.toThrow('request_sync_applied_state_missing');
  target.reopen(); expect(business(target)).toEqual(before);
}));

it('rejects a conflicting parent relation for a known version without pollution', () => scenario(async (source, target) => {
  await receive(source, target, [parent, child]);
  await upsertRemoteVersion(target.db, branch('other', 'other body'));
  target.sqlite.exec("UPDATE node_sync_version_parents SET parent_version_id = 'other' WHERE version_id = 'child'");
  const before = business(target);
  await expect(receive(source, target, [child])).rejects.toThrow('node_version_parent_identity_mismatch:child');
  target.reopen(); expect(business(target)).toEqual(before);
}));

it('adds a missing parent relation without receiving the known child body again', () => scenario(async (source, target) => {
  await receive(source, target, [parent, child]);
  target.sqlite.exec("DELETE FROM node_sync_version_parents WHERE version_id = 'child'");
  await receive(source, target, [identity(child)]); target.reopen();
  expect(target.sqlite.prepare('SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents').all())
    .toEqual([{ version_id: 'child', parent_version_id: 'parent', ordinal: 0 }]);
  expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'child'").get())
    .toEqual({ body_text: 'child body' });
}));

it('restores a reclaimed historical body when its original fact arrives again', () => scenario(async (source, target) => {
  await receive(source, target, [identity(parent), child]);
  await receive(source, target, [parent, child]); target.reopen();
  const row = target.sqlite.prepare("SELECT body_text, snapshot_json FROM node_sync_versions WHERE version_id = 'parent'")
    .get() as { body_text: string; snapshot_json: string };
  expect(row.body_text).toBe('parent body');
  expect(JSON.parse(row.snapshot_json)).toMatchObject({ id: 'node-1', title: 'Packed Node', content: null });
  expect(target.sqlite.prepare("SELECT content_hash FROM node_sync_versions WHERE version_id = 'parent'").pluck().get())
    .toBe(parent.content_hash);
}));

it('adds an edge for a reclaimed historical child while preserving its empty body', () => scenario(async (source, target) => {
  await receive(source, target, [identity(parent), identity(child), branch('head', 'current body', child)]);
  target.sqlite.exec("DELETE FROM node_sync_version_parents WHERE version_id = 'child'");
  await receive(source, target, [identity(child)]); target.reopen();
  expect(target.sqlite.prepare("SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = 'child'").get())
    .toEqual({ parent_version_id: 'parent' });
  expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'child'").get())
    .toEqual({ body_text: null });
}));
