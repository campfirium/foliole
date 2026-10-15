// @vitest-environment node
import { createHash } from 'node:crypto';

import { expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { wholeBodies } from '../database/topicTextState.testSupport.js';

import { branch, identity, receive, retiredVersionRow } from './syncPackStoredVersionDependencies.testSupport.js';

it('accepts an empty version body as valid topic text through request replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    for (let replay = 0; replay < 2; replay++) {
      await receive(source, target, [branch('desktop#1', '')]); target.reopen();
      expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'desktop#1'").get())
        .toEqual({ body_text: '' });
    }
  } finally { await fixture.close(); }
});

it('imports lightweight ancestry and preserves its original hash after a later full request', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const base = branch('desktop#1', 'Packed answer', undefined, '2026-05-04T01:00:00.000Z');
    const head = branch('head', 'Current body', base);
    await receive(source, target, [identity(base), head]);
    expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'desktop#1'").get())
      .toEqual({ body_text: null });
    for (let replay = 0; replay < 2; replay++) {
      await receive(source, target, [base, head]); target.reopen();
      expect(target.sqlite.prepare(`SELECT body_text, json_extract(snapshot_json, '$.body_blob_hash') AS hash
        FROM node_sync_versions WHERE version_id = 'desktop#1'`).get())
        .toEqual({ body_text: null, hash: createHash('sha256').update('Packed answer').digest('hex') });
      expect((await loadCurrentSyncNodeRecord(target.db, 'node-1'))?.body_text).toBe('Current body');
    }
  } finally { await fixture.close(); }
});

it('preserves local original metadata and retires unused text after its ancestry identity is replayed', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const base = branch('desktop#1', 'Packed answer', undefined, '2026-05-04T01:00:00.000Z');
    await receive(source, target, [base]);
    const original = target.sqlite.prepare<[], Record<string, unknown> & { snapshot_json: string }>(
      "SELECT * FROM node_sync_versions WHERE version_id = 'desktop#1'").get()!;
    await receive(source, target, [identity(base), branch('head', 'Current body', base)]);
    target.reopen();
    expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'desktop#1'").get())
      .toEqual({ body_text: null });
    expect(target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'desktop#1'").get()).toEqual(retiredVersionRow(original));
    expect((await loadCurrentSyncNodeRecord(target.db, 'node-1'))?.body_text).toBe('Current body');
  } finally { await fixture.close(); }
});

it('preserves both branch texts when a returning branch supplies a stripped common base', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const base = branch('shared-base', 'Original body', undefined, '2026-05-04T01:00:00.000Z');
    const local = branch('local-head', 'Local edit', base);
    await receive(source, target, [identity(base), local]);
    await receive(source, target, [base, branch('returning-head', 'Offline edit', base, '2026-05-04T03:00:00.000Z')]);
    target.reopen();
    expect(target.sqlite.prepare(`SELECT body_text, json_extract(snapshot_json, '$.body_blob_hash') AS hash
      FROM node_sync_versions WHERE version_id = 'shared-base'`).get())
      .toEqual({ body_text: null, hash: createHash('sha256').update('Original body').digest('hex') });
    expect(wholeBodies((await loadCurrentSyncNodeRecord(target.db, 'node-1'))!))
      .toEqual(new Set(['Local edit', 'Offline edit']));
  } finally { await fixture.close(); }
});
