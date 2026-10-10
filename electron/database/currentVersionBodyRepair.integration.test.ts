// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/contentBodyBlobs.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadCurrentSyncNodeRecord, loadStoredSyncNodeVersionRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { repairCurrentVersionBodyWithDriver } from './currentVersionBodyRepair.js';
import {
  assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries, sync
} from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const NOW = '2026-09-30T00:00:01.500Z';
const BODY = '123\n456\n789\n';

it.each(['empty', 'short', 'old'] as const)('appends a repair for %s body without changing old sent facts', async (kind) => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const oldVersion = edit(source, kind === 'old' ? 'Old body.' : kind === 'empty' ? '' : '123\n');
  await sync(source, target);
  writeNodeBody({ driver: source.driver, nodeId: 'topic', title: 'Topic', content: BODY, updatedAt: NOW });
  source.db.prepare('UPDATE nodes SET sync_dirty = 0 WHERE id = ?').run('topic');
  const old = source.db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(oldVersion);
  const nodes = source.db.prepare('SELECT content, body_blob_hash, updated_at FROM nodes WHERE id = ?').get('topic');
  const input = { nodeId: 'topic', expectedVersionId: oldVersion, expectedBodyBlobHash: hashTextBody(BODY),
    hostName: source.name, now: NOW };
  const repaired = repairCurrentVersionBodyWithDriver(source.driver, input);
  expect(repaired).not.toBeNull();
  expect(source.db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(oldVersion)).toEqual(old);
  expect(source.db.prepare('SELECT content, body_blob_hash, updated_at FROM nodes WHERE id = ?').get('topic')).toEqual(nodes);
  expect((await loadStoredSyncNodeVersionRecord(source.port, oldVersion))?.body_text)
    .toBe(kind === 'empty' ? '' : kind === 'short' ? '123\n' : 'Old body.');
  expect(repairCurrentVersionBodyWithDriver(source.driver, input)).toBeNull();
  expect((await loadCurrentSyncNodeRecord(source.port, 'topic'))?.body_text).toBe(BODY);
  await sync(source, target);
  assertPersisted(source, BODY, repaired!);
  assertPersisted(target, BODY, repaired!);
  edit(source, '123-left\n456\n789\n');
  edit(target, '123\n456\n789-right\n');
  await sync(target, source);
  const merged = (await loadCurrentSyncNodeRecord(source.port, 'topic'))!;
  expect(new Set([merged.body_text, ...merged.alternative_bodies?.map(body => body.text) ?? []]))
    .toEqual(new Set(['123-left\n456\n789\n', '123\n456\n789-right\n']));
  assertPersisted(source, merged.body_text!, merged.version_id!);
  await sync(source, target);
  assertPersisted(target, merged.body_text!, merged.version_id!);
});

it('rolls back failed publication and rejects stale baselines, active edits and invalid bytes', () => {
  const source = createPeer('source');
  const version = edit(source, BODY);
  source.db.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?').run('', version);
  const before = history(source);
  const input = { nodeId: 'topic', expectedVersionId: version, expectedBodyBlobHash: hashTextBody(BODY),
    hostName: source.name, now: NOW };
  expect(() => repairCurrentVersionBodyWithDriver(source.driver, { ...input, expectedVersionId: 'stale' }))
    .toThrow('current_body_repair_baseline_changed');
  source.db.prepare('INSERT INTO node_version_local_holds VALUES (?, ?, ?, ?)').run('editing', 'topic', version, NOW);
  expect(() => repairCurrentVersionBodyWithDriver(source.driver, input)).toThrow('current_body_repair_editor_active');
  source.db.prepare('DELETE FROM node_version_local_holds').run();
  source.db.exec(`CREATE TRIGGER reject_repair BEFORE UPDATE ON sync_object_state
    BEGIN SELECT RAISE(ABORT, 'publication_failed'); END`);
  expect(() => repairCurrentVersionBodyWithDriver(source.driver, input)).toThrow('publication_failed');
  expect(history(source)).toEqual(before);
  expect(source.db.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get('topic')).toBe(version);
  source.db.exec('DROP TRIGGER reject_repair');
  source.db.prepare("UPDATE nodes SET content = 'Wrong' WHERE id='topic'").run();
  expect(() => repairCurrentVersionBodyWithDriver(source.driver, input)).toThrow('current_body_repair_blob_invalid');
  expect(history(source)).toEqual(before);
});

it('repairs a retained deleted node without restoring it or rewriting its old version', () => {
  const source = createPeer('source');
  const version = edit(source, BODY);
  source.db.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?').run('', version);
  source.db.prepare('UPDATE nodes SET deleted_at = ? WHERE id = ?').run(NOW, 'topic');
  const old = source.db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(version);
  const repaired = repairCurrentVersionBodyWithDriver(source.driver, {
    nodeId: 'topic', expectedVersionId: version, expectedBodyBlobHash: hashTextBody(BODY),
    hostName: source.name, now: NOW
  });
  expect(repaired).not.toBeNull();
  expect(source.db.prepare('SELECT deleted_at FROM nodes WHERE id = ?').pluck().get('topic')).toBe(NOW);
  expect(source.db.prepare("SELECT deleted_at FROM sync_object_state WHERE object_id = ? AND object_type = 'node'")
    .pluck().get('topic')).toBe(NOW);
  expect(source.db.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get(version)).toEqual(old);
  const snapshot = JSON.parse(source.db.prepare('SELECT snapshot_json FROM node_sync_versions WHERE version_id = ?')
    .pluck().get(repaired!) as string);
  expect(snapshot.deleted_at).toBe(NOW);
});

it('keeps an offline peer edit made before repair when it reaches the repaired head', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const version = edit(source, '');
  await sync(source, target);
  writeNodeBody({ driver: source.driver, nodeId: 'topic', title: 'Topic', content: BODY, updatedAt: NOW });
  source.db.prepare("UPDATE nodes SET sync_dirty = 0 WHERE id='topic'").run();
  const peerBody = '123\n456\n789-peer\n';
  edit(target, peerBody);
  repairCurrentVersionBodyWithDriver(source.driver, {
    nodeId: 'topic', expectedVersionId: version, expectedBodyBlobHash: hashTextBody(BODY),
    hostName: source.name, now: NOW
  });
  await sync(target, source);
  const current = (await loadCurrentSyncNodeRecord(source.port, 'topic'))!;
  const alternatives = source.db.prepare("SELECT body_text FROM node_text_alternatives WHERE status = 'available'")
    .pluck().all();
  expect(current.body_text).toBe(peerBody);
  await sync(source, target);
  assertPersisted(target, current.body_text!, current.version_id!);
  expect(target.db.prepare("SELECT body_text FROM node_text_alternatives WHERE status = 'available'").pluck().all())
    .toEqual(alternatives);
});
