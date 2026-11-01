// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-versioned-node-mutation-tests';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot.js';
import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import {
  upsertVersionedNodeSnapshot
} from '../database/nodeVersionedMutations.js';

vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

import { handleLocalContentEditCommand } from './storageLocalContentEditCommand.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-versioned-node-mutation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  await initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function nodeInput(content: string, updatedAt: string) {
  return {
    anchorLink: null,
    content,
    createdAt: '2026-07-25T04:30:00.000Z',
    isTitleManual: true,
    kind: 'topic' as const,
    nodeId: 'node-1',
    parentNodeId: null,
    position: 0,
    reveal: null,
    title: 'Sync closure',
    updatedAt
  };
}



it.each(['2026-07-25T04:32:00.000Z', '2026-07-25T04:36:00.000Z'])(
  'returns both whole bodies and confirmation identities for local time %s', async (updatedAt) => {
  upsertVersionedNodeSnapshot(nodeInput('First\nMiddle\nLast\n', '2026-07-25T04:30:00.000Z'));
  const base = openDatabaseConnection().sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get('node-1') as { current_version_id: string };
  await retainLocalEditBase(createBetterSqliteDbPort(openDatabaseConnection().sqlite), {
    holdId: 'editor', nodeId: 'node-1', versionId: base.current_version_id
  });
  upsertVersionedNodeSnapshot(nodeInput('First\nMiddle\nRemote last\n', '2026-07-25T04:35:00.000Z'));
  const result = await handleLocalContentEditCommand({
    parent: nodeInput('Local first\nMiddle\nLast\n', updatedAt),
    affectedAnchors: [],
    edit: { baseVersionId: base.current_version_id, versionId: 'ver_local' }
  }, null) as { nodes: Array<{ content: string }>; contentEdit: { submittedVersionId: string; currentVersionId: string } };
  const expectedBodies = new Set(['First\nMiddle\nRemote last\n', 'Local first\nMiddle\nLast\n']);
  const current = result.nodes[0]?.content;
  expect(current).toBeDefined();
  expect(new Set(openDatabaseConnection().sqlite.prepare(`SELECT json_extract(body.value, '$.text') AS body_text FROM nodes n
    JOIN node_sync_versions version ON version.version_id = n.current_version_id,
    json_each(version.snapshot_json, '$.text_alternative_bodies') body
    WHERE n.id = 'node-1'`).all()
    .map((row) => (row as { body_text: string }).body_text).concat(current!)))
    .toEqual(expectedBodies);
  expect(result.contentEdit.submittedVersionId).toBe('ver_local');
  expect(result.contentEdit.currentVersionId).toBeTruthy();
});

it('rejects malformed edit identities before writing', async () => {
  upsertVersionedNodeSnapshot(nodeInput('Original', '2026-07-25T04:30:00.000Z'));
  await expect(handleLocalContentEditCommand({
    parent: nodeInput('Local', '2026-07-25T04:32:00.000Z'), affectedAnchors: [],
    edit: { baseVersionId: 12, versionId: 'ver_local' }
  }, null)).rejects.toThrow();
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual({ count: 1 });
});

it('preserves the normal anchor remap and retries the same saved version', async () => {
  const original = 'Prefix Target sentence.';
  const content = 'Longer prefix Target sentence.';
  upsertVersionedNodeSnapshot(nodeInput(original, '2026-07-25T04:30:00.000Z'));
  upsertVersionedNodeSnapshot({
    ...nodeInput('Target sentence.', '2026-07-25T04:30:00.000Z'),
    nodeId: 'child', parentNodeId: 'node-1',
    anchorLink: { id: 'anchor', kind: 'highlight', locator: {
      from: original.indexOf('Target'), to: original.length, originalText: 'Target sentence.'
    } }
  });
  const sqlite = openDatabaseConnection().sqlite;
  const base = sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?')
    .get('node-1') as { current_version_id: string };
  await retainLocalEditBase(createBetterSqliteDbPort(sqlite), {
    holdId: 'editor', nodeId: 'node-1', versionId: base.current_version_id
  });
  const request = {
    parent: nodeInput(content, '2026-07-25T04:32:00.000Z'), affectedAnchors: [],
    edit: { baseVersionId: base.current_version_id, versionId: 'ver_normal-edit' }
  };
  await handleLocalContentEditCommand(request, null);
  const count = sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get();
  await handleLocalContentEditCommand(request, null);
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual(count);
  const row = sqlite.prepare('SELECT anchor_link FROM nodes WHERE id = ?').get('child') as { anchor_link: string };
  expect(JSON.parse(row.anchor_link).locator.from).toBe(content.indexOf('Target'));
});


it('retains the persisted edit basis after reopening through the workspace list', async () => {
  upsertVersionedNodeSnapshot(nodeInput('Original', '2026-07-25T04:30:00.000Z'));
  const connection = openDatabaseConnection();
  const basis = loadWorkspaceListSnapshot(connection.driver)?.nodesById['node-1']?.currentVersionId;
  expect(basis).toBeTruthy();
  if (!basis) throw new Error('reopened_edit_basis_missing');
  await retainLocalEditBase(createBetterSqliteDbPort(connection.sqlite), {
    holdId: 'reopened-editor', nodeId: 'node-1', versionId: basis
  });
  upsertVersionedNodeSnapshot(nodeInput('Remote', '2026-07-25T04:35:00.000Z'));
  await handleLocalContentEditCommand({ parent: nodeInput('Local', '2026-07-25T04:36:00.000Z'),
    affectedAnchors: [], edit: { baseVersionId: basis, versionId: 'ver_reopened' } }, null);
  const current = connection.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('node-1');
  const alternatives = connection.sqlite.prepare(`SELECT json_extract(body.value, '$.text') FROM nodes n
    JOIN node_sync_versions v ON v.version_id = n.current_version_id,
    json_each(v.snapshot_json, '$.text_alternative_bodies') body WHERE n.id = ?`).pluck().all('node-1');
  expect(new Set([current, ...alternatives])).toEqual(new Set(['Remote', 'Local']));
  expect(connection.sqlite.prepare('SELECT parent_version_id FROM node_sync_versions WHERE version_id = ?')
    .pluck().get('ver_reopened')).toBe(basis);
});

it('prepares files without versions and atomically saves image names through the IPC fast path', async () => {
  const { importClipboardImageAttachment } = await import('../attachments/importClipboardImageAttachment.js');
  const sqlite = openDatabaseConnection().sqlite;
  upsertVersionedNodeSnapshot(nodeInput('Original', '2026-07-25T04:30:00.000Z'));
  const base = String(sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").pluck().get());
  const bytes = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex');
  const imported = await importClipboardImageAttachment({ nodeId: 'node-1', bytesBase64: bytes.toString('base64'),
    mimeType: 'image/png', originalName: 'Original source.png' });
  if (imported.status !== 'imported') throw new Error('image_prepare_failed');
  expect(sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(1);
  const request = { parent: nodeInput(`![image](asset://${imported.storage_key})`, '2026-07-25T04:32:00.000Z'),
    affectedAnchors: [], edit: { baseVersionId: base, baseContent: 'Original', versionId: 'image-edit',
      newImageReferences: [{ storage_key: imported.storage_key, original_name: imported.original_name, role: 'image' }] } };
  sqlite.exec(`CREATE TRIGGER reject_local_receipt_in_version BEFORE UPDATE OF snapshot_json ON node_sync_versions
    WHEN json_type(NEW.snapshot_json, '$.local_edit_image_input_hash') IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'local_receipt_changed_version_fact'); END`);
  await handleLocalContentEditCommand(request, null);
  expect(JSON.parse(String(sqlite.prepare("SELECT resource_references FROM nodes WHERE id = 'node-1'").pluck().get())))
    .toEqual(request.edit.newImageReferences);
  expect(sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(2);
  await handleLocalContentEditCommand(request, null);
  expect(sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(2);
  await expect(handleLocalContentEditCommand({ ...request, edit: { ...request.edit, newImageReferences: [] } }, null))
    .rejects.toThrow('content_edit_version_mismatch');
  await expect(handleLocalContentEditCommand({ ...request, edit: { ...request.edit, newImageReferences: [{ storage_key: '../x', role: 'image', original_name: 'X' }] } }, null)).rejects.toThrow('node_resource_reference_invalid');
  closeDatabaseConnection();
  await initializeDatabase();
  await handleLocalContentEditCommand(request, null);
  expect(openDatabaseConnection().sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(2);
  await expect(handleLocalContentEditCommand({ ...request, edit: { ...request.edit, newImageReferences: [] } }, null))
    .rejects.toThrow('content_edit_version_mismatch');
});

it.each(['New answer', '', null])('saves an answer and preserves it through a subsequent body replay: %s', async reveal => {
  const initial = { ...nodeInput('Question body', '2026-07-25T04:30:00.000Z'), kind: 'item' as const, reveal: 'Original answer' };
  const baseVersionId = upsertVersionedNodeSnapshot(initial)!;
  const answer = await handleLocalContentEditCommand({
    parent: { ...initial, reveal, updatedAt: '2026-07-25T04:31:00.000Z' }, affectedAnchors: [],
    edit: { baseVersionId, versionId: 'ver_answer_replay', reveal }
  }, null) as unknown as { contentEdit: { submittedVersionId: string }; nodes: Array<{ reveal: string | null }> };
  const read = () => openDatabaseConnection().sqlite.prepare('SELECT content, reveal, current_version_id FROM nodes WHERE id = ?').get(initial.nodeId);
  expect(read()).toMatchObject({ content: 'Question body', reveal, current_version_id: 'ver_answer_replay' });
  expect(answer.nodes[0]?.reveal).toBe(reveal);
  await handleLocalContentEditCommand({
    parent: { ...initial, content: 'Restored question', updatedAt: '2026-07-25T04:32:00.000Z' }, affectedAnchors: [],
    edit: { baseVersionId: answer.contentEdit.submittedVersionId, versionId: 'ver_body_replay' }
  }, null);
  expect(read()).toMatchObject({ content: 'Restored question', reveal, current_version_id: 'ver_body_replay' });
});

it('rejects a malformed answer before changing stored facts', async () => {
  const initial = nodeInput('Question', '2026-07-25T04:30:00.000Z');
  const baseVersionId = upsertVersionedNodeSnapshot(initial)!;
  await expect(handleLocalContentEditCommand({ parent: initial, affectedAnchors: [],
    edit: { baseVersionId, versionId: 'bad-answer', reveal: 42 } }, null)).rejects.toThrow();
  expect(openDatabaseConnection().sqlite.prepare('SELECT content, reveal FROM nodes WHERE id = ?').get(initial.nodeId))
    .toEqual({ content: 'Question', reveal: null });
  expect(openDatabaseConnection().sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(1);
});

it.each([false, true])('saves only the answer with an old parent question (stale basis=%s)', async stale => {
  const initial = { ...nodeInput('Question', '2026-07-25T04:30:00.000Z'), kind: 'item' as const, reveal: 'Old answer' };
  const baseVersionId = upsertVersionedNodeSnapshot(initial)!;
  await retainLocalEditBase(createBetterSqliteDbPort(openDatabaseConnection().sqlite), {
    holdId: 'answer-editor', nodeId: initial.nodeId, versionId: baseVersionId
  });
  await handleLocalContentEditCommand({ parent: { ...initial, content: 'Question edit', updatedAt: '2026-07-25T04:31:00.000Z' },
    affectedAnchors: [], edit: { baseVersionId, versionId: 'body-before-answer' } }, null);
  await handleLocalContentEditCommand({ parent: { ...initial, reveal: 'Answer edit', updatedAt: '2026-07-25T04:32:00.000Z' },
    affectedAnchors: [], edit: { baseVersionId: stale ? baseVersionId : 'body-before-answer', versionId: 'answer-only', field: 'reveal', reveal: 'Answer edit' } }, null);
  expect(openDatabaseConnection().sqlite.prepare('SELECT content, reveal FROM nodes WHERE id = ?').get(initial.nodeId))
    .toEqual({ content: 'Question edit', reveal: 'Answer edit' });
});

it.each([42, 'content'])('rejects an unsupported field before writing: %s', async field => {
  const initial = nodeInput('Question', '2026-07-25T04:30:00.000Z');
  const baseVersionId = upsertVersionedNodeSnapshot(initial)!;
  await expect(handleLocalContentEditCommand({ parent: initial, affectedAnchors: [],
    edit: { baseVersionId, versionId: 'bad-field', field, reveal: 'Answer' } }, null)).rejects.toThrow('content_edit_field_invalid');
  expect(openDatabaseConnection().sqlite.prepare('SELECT content, reveal FROM nodes WHERE id = ?').get(initial.nodeId))
    .toEqual({ content: 'Question', reveal: null });
});
