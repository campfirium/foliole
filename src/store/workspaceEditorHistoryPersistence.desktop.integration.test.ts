import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Text } from '@codemirror/state';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection.js';
import { loadEditorOperationHistory, saveEditorOperationHistory } from '../../electron/database/editorOperationHistory.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import type { NativeInvoke } from '../../lib/platform/nativeContract';
import { createEmptyEditorOperationHistory, moveEditorOperationEntry, pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { createAnnotationHistoryEntry, createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';
import { deserializeEditorOperationHistory, serializeEditorOperationHistory } from '../features/editor/model/editorOperationHistoryPersistence';
import { flushEditorOperationHistorySave, loadEditorOperationHistoryFromRuntime } from '../shared/platform/runtime/editorOperationHistoryRuntimeRepository';

import { useWorkspaceStore } from './workspaceStore';

let appDataDir = '';
vi.mock('../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir, app_log_dir: path.join(appDataDir, 'logs')
  })
}));


let root = '';

beforeEach(async () => {
  delete window.electronAPI;
  await flushEditorOperationHistorySave();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-history-queue-'));
  appDataDir = path.join(root, 'library');
  initializeDatabase();
  useWorkspaceStore.setState({ editorOperationHistory: createEmptyEditorOperationHistory() });
  await flushEditorOperationHistorySave();
});

afterEach(async () => {
  await flushEditorOperationHistorySave();
  delete window.electronAPI;
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function installStorageTransport(beforeSave: () => Promise<void> = async () => {}) {
  window.electronAPI = {
    invoke: (async (command: string, args?: { payloadJson: string }) => {
      if (command === 'load_editor_operation_history') return loadEditorOperationHistory();
      if (command === 'save_editor_operation_history') {
        await beforeSave();
        saveEditorOperationHistory(args!.payloadJson);
      }
      return null;
    }) as NativeInvoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

function createMixedHistory() {
  const text = createTextHistoryEntry({ afterContent: 'AB', beforeContent: 'A', nodeId: 'topic-a' });
  text.target = { nodeId: 'topic-a', field: 'reveal', beforeVersionId: 'before', afterVersionId: 'after' };
  let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), text);
  history = moveEditorOperationEntry(history, 'topic-a', 'undo');
  history = pushEditorOperationEntry(history, createAnnotationHistoryEntry('topic-b', 'annotation.create'));
  history = pushEditorOperationEntry(history, createAnnotationHistoryEntry('topic-b', 'annotation.delete', 'pending'));
  const applying = createAnnotationHistoryEntry('topic-c', 'annotation.delete');
  applying.applyingMode = 'undo';
  return pushEditorOperationEntry(history, applying);
}

it('drains the captured newest snapshot to SQLite and restores exact replay data after reopen', async () => {
  const blocked = Promise.withResolvers<void>();
  let saves = 0;
  installStorageTransport(async () => { if (++saves === 1) await blocked.promise; });
  const history = createMixedHistory();
  useWorkspaceStore.setState({ editorOperationHistory: history });
  useWorkspaceStore.setState({ editorOperationHistory: createEmptyEditorOperationHistory() });
  const newest = { ...history, invalidations: [{ nodeId: 'stale', reason: 'external replacement' }] };
  useWorkspaceStore.setState({ editorOperationHistory: newest });
  const flush = flushEditorOperationHistorySave();
  blocked.resolve();
  await flush;
  expect(saves).toBe(2);
  expect(loadEditorOperationHistory()).toBe(serializeEditorOperationHistory(newest));
  closeDatabaseConnection();
  initializeDatabase();
  const restored = deserializeEditorOperationHistory((await loadEditorOperationHistoryFromRuntime())!);
  expect(restored.invalidations).toEqual(newest.invalidations);
  expect(restored.recentNodeIds).toEqual(newest.recentNodeIds);
  expect(restored.sessionsByNodeId['topic-a']?.undoStack).toEqual([]);
  expect(restored.sessionsByNodeId['topic-b']?.undoStack).toHaveLength(1);
  expect(restored.sessionsByNodeId['topic-c']?.undoStack).toEqual([]);
  const entry = restored.sessionsByNodeId['topic-a']!.redoStack[0]!;
  expect(entry.type).toBe('text.edit');
  if (entry.type !== 'text.edit') throw new Error('text history missing');
  expect(entry.target).toEqual({
    nodeId: 'topic-a', field: 'reveal', beforeVersionId: 'before', afterVersionId: 'after'
  });
  expect(entry.forwardChanges.apply(Text.of(['A'])).toString()).toBe('AB');
  expect(entry.inverseChanges.apply(Text.of(['AB'])).toString()).toBe('A');
  expect(entry.beforeDigest).toBe(createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB' }).beforeDigest);
});

it('retains the last durable history on SQLite failure and writes a later resubmission', async () => {
  installStorageTransport();
  const history = createMixedHistory();
  useWorkspaceStore.setState({ editorOperationHistory: history });
  await flushEditorOperationHistorySave();
  const saved = loadEditorOperationHistory();
  openDatabaseConnection().sqlite.exec(`CREATE TRIGGER reject_history BEFORE INSERT ON editor_operation_history
    BEGIN SELECT RAISE(ABORT, 'history storage failed'); END`);
  const latest = { ...history, invalidations: [{ nodeId: 'stale', reason: 'changed' }] };
  useWorkspaceStore.setState({ editorOperationHistory: latest });
  await flushEditorOperationHistorySave();
  expect(loadEditorOperationHistory()).toBe(saved);
  expect(useWorkspaceStore.getState().editorOperationHistory).toBe(latest);
  openDatabaseConnection().sqlite.exec('DROP TRIGGER reject_history');
  useWorkspaceStore.setState({ editorOperationHistory: { ...latest } });
  await flushEditorOperationHistorySave();
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadEditorOperationHistory()).toBe(serializeEditorOperationHistory(latest));
});
