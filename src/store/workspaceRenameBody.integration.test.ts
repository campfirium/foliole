// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
let failDocumentRead: 'failed' | 'throw' | null = null;
const writes: Record<string, unknown>[] = [];
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'rename-body', libraryPath })
}));
vi.mock('../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
// Mirror export has its own integration suite and must not outlive this document fixture.
vi.mock('../../electron/mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: Record<string, unknown>) => {
  if (command === 'load_node_document' && failDocumentRead === 'throw') throw new Error('document unavailable');
  if (command === 'load_node_document' && failDocumentRead === 'failed') return { nodeId: args.nodeId,
    content: '', reveal: null, kind: 'topic', hideTitleHeading: false, bodyStatus: 'failed' };
  if (command === 'update_node_content') writes.push(args);
  return handleStorageCommand(command, args);
} }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection.js';
import { resetSeededWorkspace } from '../../electron/database/databaseTestWorkspace.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { flushCoalescedWorkspaceSearchInvalidations } from '../../electron/database/searchIndexInvalidationCoalescer.js';
import { loadWorkspaceListSnapshot } from '../../electron/database/workspaceListSnapshot.js';
import { loadWorkspaceNodeDocument } from '../../electron/database/workspaceNodeDocument.js';
import { observeWorkspaceTestDatabaseLifecycle } from '../../electron/database/workspaceTestDatabaseLifecycle.testSupport.js';
import { handleStorageCommand } from '../../electron/ipc/storageCommands.js';
import type { Node } from '../features/nodes/model/nodeTypes';

import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument, toRendererBoundaryNode } from './workspaceRendererBoundary';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';
import { createUpdateNodeTitleAction } from './workspaceStoreNodeEditActions';

let snapshotConnections = () => undefined as void;
beforeEach(async context => {
  snapshotConnections = observeWorkspaceTestDatabaseLifecycle(context.task.name);
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-rename-body-'));
  initializeDatabase();
  resetSeededWorkspace();
  writes.length = 0;
  failDocumentRead = null;
});
afterEach(async () => {
  try {
    await closeFixtureDatabase();
    await fs.rm(root, { recursive: true, force: true });
    await expect(fs.access(root)).rejects.toThrow();
  } finally {
    snapshotConnections();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

async function closeFixtureDatabase() {
  await flushCoalescedWorkspaceSearchInvalidations();
  closeDatabaseConnection();
}

async function createNode(id: string, content: string, reveal: string | null = null, parentNodeId: string | null = null) {
  await handleStorageCommand('create_topic', {
    nodeId: id, parentNodeId, kind: 'topic', title: 'Before', content, reveal,
    isTitleManual: true, hideTitleHeading: false,
    ...(content.includes('asset://') ? { newImageReferences: [{ storage_key: `${'a'.repeat(64)}.png`, original_name: 'Original.png', role: 'image' }] } : {}),
    createdAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:00:00.000Z', position: null
  });
}

function createHarness(id: string) {
  const snapshot = loadWorkspaceListSnapshot();
  const harness = createWorkspaceNodeActionsSetStateHarness({
    ...createWorkspaceNodeActionsFixture(), ...snapshot,
    nodesById: snapshot.nodesById as Record<string, Node>, activeNodeId: null
  });
  const rename = createUpdateNodeTitleAction(harness.setState);
  const current = () => harness.getState().nodesById[id]!;
  const publish = (node: Node) => harness.setState(state => ({ nodesById: { ...state.nodesById, [id]: node } }));
  return { current, rename, publish };
}

it.each([
  { name: 'plain body', content: 'Original complete body 中😀.\nSecond paragraph.', expected: 'Original complete body 中😀.\nSecond paragraph.' },
  { name: 'unique heading', content: '# Before\n\nOriginal paragraph.', expected: '# After\n\nOriginal paragraph.' },
  { name: 'image reference', content: `Image body. ![Original](asset://${'a'.repeat(64)}.png)`, expected: `Image body. ![Original](asset://${'a'.repeat(64)}.png)` },
  { name: 'empty body', content: '', expected: '' }
])('renames unopened $name and retains the durable document when opened afterward', async ({ content, expected }) => {
  await createNode('rename', content);
  await createNode('child', 'Unopened child body.', 'Child answer.', 'rename');
  const childBefore = loadWorkspaceNodeDocument('child');
  const resourcesBefore = openDatabaseConnection().driver.queryOne('SELECT resource_references FROM nodes WHERE id = ?', ['rename']);
  const h = createHarness('rename');
  expect(h.current().content).toBe('');
  if (content) expect(isNodeDocumentLoaded(h.current())).toBe(false);

  expect(await h.rename('rename', 'After')).toBe(true);
  const saved = loadWorkspaceNodeDocument('rename')!;
  expect(saved.content).toBe(expected);
  expect(writes.at(-1)?.content).toBe(expected);
  expect(saved.currentVersionId).toBeTruthy();
  h.publish(mergeWorkspaceNodeDocument(h.current(), saved));
  expect(h.current().content).toBe(expected);
  expect(h.current().currentVersionId).toBe(saved.currentVersionId);
  closeDatabaseConnection();
  expect(loadWorkspaceNodeDocument('rename')).toMatchObject({ content: expected, currentVersionId: saved.currentVersionId });
  expect(loadWorkspaceNodeDocument('child')).toEqual(childBefore);
  expect(openDatabaseConnection().driver.queryOne('SELECT resource_references FROM nodes WHERE id = ?', ['rename'])).toEqual(resourcesBefore);
});

it('preserves body and answer through loaded rename, projection eviction and a second rename in one instance', async () => {
  await createNode('rename', '# Before\n\nQuestion body.', 'Original answer.');
  const h = createHarness('rename');
  h.publish(mergeWorkspaceNodeDocument(h.current(), loadWorkspaceNodeDocument('rename')!));
  expect(await h.rename('rename', 'First')).toBe(true);
  expect(loadWorkspaceNodeDocument('rename')).toMatchObject({ content: '# First\n\nQuestion body.', reveal: 'Original answer.' });
  h.publish(toRendererBoundaryNode(h.current(), false));
  expect(h.current().content).toBe('');
  expect(isNodeDocumentLoaded(h.current())).toBe(false);

  expect(await h.rename('rename', 'Second')).toBe(true);
  const saved = loadWorkspaceNodeDocument('rename')!;
  expect(saved).toMatchObject({ content: '# Second\n\nQuestion body.', reveal: 'Original answer.' });
  h.publish(mergeWorkspaceNodeDocument(h.current(), saved));
  expect(h.current()).toMatchObject({ content: saved.content, reveal: saved.reveal, currentVersionId: saved.currentVersionId });
  closeDatabaseConnection();
  expect(loadWorkspaceNodeDocument('rename')).toEqual(saved);
});

it.each(['failed', 'throw'] as const)('leaves the original document and title unchanged when its required body read is %s', async (failure) => {
  await createNode('rename', 'Irreplaceable body.', 'Original answer.');
  const before = loadWorkspaceNodeDocument('rename');
  const h = createHarness('rename');
  failDocumentRead = failure;
  expect(await h.rename('rename', 'After')).toBe(false);
  expect(writes).toHaveLength(0);
  expect(h.current().title).toBe('Before');
  expect(loadWorkspaceNodeDocument('rename')).toEqual(before);
});

it('captures a loaded rename before an immediate renderer projection releases its body', async () => {
  await createNode('rename', 'Loaded body.');
  const h = createHarness('rename');
  h.publish(mergeWorkspaceNodeDocument(h.current(), loadWorkspaceNodeDocument('rename')!));
  const rename = h.rename('rename', 'After');
  h.publish(toRendererBoundaryNode(h.current(), false));
  expect(await rename).toBe(true);
  expect(loadWorkspaceNodeDocument('rename')).toMatchObject({ content: 'Loaded body.' });
});

it('does not reopen the fixture database from deferred work after teardown', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await createNode('rename', 'Durable body.');
  const h = createHarness('rename');
  expect(await h.rename('rename', 'After')).toBe(true);
  expect(loadWorkspaceNodeDocument('rename')?.content).toBe('Durable body.');
  await closeFixtureDatabase();
  const prepare = vi.spyOn(Database.prototype, 'prepare').mockClear();
  try {
    await vi.advanceTimersByTimeAsync(60_000);
    expect(prepare).not.toHaveBeenCalled();
  } finally {
    prepare.mockRestore();
  }
});
