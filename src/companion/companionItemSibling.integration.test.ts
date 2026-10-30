import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { applyCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryReplay';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { getSelectionCommandPayloadForContentRanges } from '../shared/selectionCommandPayload';

import { persistCompanionSelectionAnnotation } from './companionSelectionAnnotationActions';

let root = '';
let database: Database.Database | null = null;
const time = '2026-10-30T00:00:00Z';
const topic: WorkspaceNodeSnapshot = { id: 'topic', kind: 'topic', title: 'Topic', content: 'Original parent text',
  parentNodeId: null, reveal: null, anchorLink: null, reading: null, review: null, createdAt: time, updatedAt: time,
  isTitleManual: true, hideTitleHeading: false };
const item: WorkspaceNodeSnapshot = { ...topic, id: 'item', kind: 'item', parentNodeId: 'topic',
  content: 'Rewritten [...] Gamma', reveal: 'Beta' };

async function openLibrary() {
  const file = path.join(root, 'companion.db');
  const existed = existsSync(file);
  const sqlite = new Database(file);
  database = sqlite;
  await initializeIosCompanionDatabase({ booted_at: time, database_path: null, database_ready: false,
    host_name: 'Item sibling test', runtime_kind: 'android-capacitor' },
  createFakeCapacitorDatabaseManager(sqlite, existed, () => { database = null; }));
}

async function seed(node: WorkspaceNodeSnapshot) {
  const version = await toWorkspaceNativeNodeVersion(node, 'test-device', node.id + '-version');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [version], { enqueueSearchInvalidations: false }));
}

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'item-sibling-'));
  await openLibrary();
  await seed(topic);
  await seed(item);
});

afterEach(async () => {
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

it.each(['highlight', 'cloze', 'note'] as const)('persists a sibling %s from an edited Item and hydrates it after reopening', async (kind) => {
  const payload = getSelectionCommandPayloadForContentRanges('item', item.content, [{ from: 16, to: 21 }])!;
  const result = await persistCompanionSelectionAnnotation({ deviceId: 'device', kind, payload,
    note: 'Reader note', snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  expect(result).toBeTruthy();
  const saved = await loadCompanionWorkspaceNode(result!.nodeId);
  expect(saved).toMatchObject({ parentNodeId: 'topic', anchorLink: null,
    content: kind === 'cloze' ? 'Rewritten Beta [...]' : kind === 'note' ? 'Gamma\n※ Reader note' : 'Gamma',
    reveal: kind === 'cloze' ? 'Gamma' : null, kind: kind === 'cloze' ? 'item' : 'topic' });
  expect(await loadCompanionWorkspaceNode('item')).toMatchObject(item);
  expect(await loadCompanionWorkspaceNode('topic')).toMatchObject(topic);
  await applyCompanionEditHistory('item', 'undo');
  expect((await loadCompanionWorkspaceNode(result!.nodeId))?.deletedAt).toBeTruthy();
  await applyCompanionEditHistory('item', 'redo');
  expect(await loadCompanionWorkspaceNode(result!.nodeId)).toMatchObject({ parentNodeId: 'topic', content: saved!.content });
  expect((await loadCompanionWorkspaceNode(result!.nodeId))?.deletedAt).toBeFalsy();
  const restored = await loadCompanionWorkspaceNode(result!.nodeId);
  await closeIosCompanionDatabase();
  await openLibrary();
  expect(await loadCompanionWorkspaceNode(result!.nodeId)).toEqual(restored);
});

it('restores the selected old blank instead of copying its placeholder', async () => {
  const payload = getSelectionCommandPayloadForContentRanges('item', item.content, [{ from: 10, to: 15 }])!;
  const result = await persistCompanionSelectionAnnotation({ deviceId: 'device', kind: 'highlight', payload,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  expect(await loadCompanionWorkspaceNode(result!.nodeId)).toMatchObject({ parentNodeId: 'topic', content: 'Beta', anchorLink: null });
});

it('keeps Topic derivation anchored to the Topic', async () => {
  const payload = getSelectionCommandPayloadForContentRanges('topic', topic.content, [{ from: 0, to: 8 }])!;
  const result = await persistCompanionSelectionAnnotation({ deviceId: 'device', kind: 'highlight', payload,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  expect(await loadCompanionWorkspaceNode(result!.nodeId)).toMatchObject({ parentNodeId: 'topic', content: 'Original',
    anchorLink: { id: payload.anchorId, kind: 'highlight', locator: { from: 0, to: 8, originalText: 'Original' } } });
});

it('creates a root sibling and can undo and redo it from its source Item', async () => {
  await seed({ ...item, id: 'root-item', parentNodeId: null });
  const payload = getSelectionCommandPayloadForContentRanges('root-item', item.content, [{ from: 16, to: 21 }])!;
  const result = await persistCompanionSelectionAnnotation({ deviceId: 'device', kind: 'cloze', payload,
    snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
  expect(await loadCompanionWorkspaceNode(result!.nodeId)).toMatchObject({ parentNodeId: null, content: 'Rewritten Beta [...]' });
  await applyCompanionEditHistory('root-item', 'undo');
  expect((await loadCompanionWorkspaceNode(result!.nodeId))?.deletedAt).toBeTruthy();
  await applyCompanionEditHistory('root-item', 'redo');
  expect((await loadCompanionWorkspaceNode(result!.nodeId))?.deletedAt).toBeFalsy();
  expect((await loadCompanionWorkspaceNode(result!.nodeId))?.parentNodeId).toBeNull();
});
