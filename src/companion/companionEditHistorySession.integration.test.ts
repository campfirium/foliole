import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { createEmptyEditorOperationHistory, getEditorOperationSession, pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { createAnnotationHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { applyCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryReplay';
import { loadCompanionEditHistory, readCompanionEditHistoryFromDb, writeCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryRepository';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { clearIosCompanionActiveData } from '../shared/platform/companion/runtime/iosCompanionActiveDataClear';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const now = '2026-10-28T08:00:00Z';
beforeEach(async () => {
  library = await createSearchLibrary(0);
  const record = await toWorkspaceNativeNodeVersion({ id: 'topic', content: 'Original', kind: 'topic', title: 'Topic',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null,
    reading: null, review: null, createdAt: now, updatedAt: now }, 'remote', 'base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

async function append(db: Parameters<typeof writeCompanionEditHistory>[0], id: string) {
  const before = await readCompanionEditHistoryFromDb(db);
  const entry = { ...createAnnotationHistoryEntry('topic', 'annotation.create'), annotations: [] };
  await db.run('INSERT INTO companion_meta (key,value,updated_at) VALUES (?, ?, ?)', [id, 'committed', now]);
  await writeCompanionEditHistory(db, before, pushEditorOperationEntry(before, entry));
}

it('drops old undo and only its own holds on reopen while preserving saved text and sync facts', async () => {
  const source = await readCompanionContentSource('topic');
  await saveCompanionContentEdit({ nodeId: 'topic', content: 'Saved', baseContent: source.content,
    baseVersionId: source.versionId, versionId: 'edited', updatedAt: now });
  expect(getEditorOperationSession(await loadCompanionEditHistory(), 'topic').undoStack).toHaveLength(1);
  const db = library.database;
  const versions = db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  db.prepare('INSERT INTO companion_meta (key,value,updated_at) VALUES (?,?,?)')
    .run('editor_operation_history', '{"version":1,"retired":true}', now);
  for (const id of ['editor_history:old', 'editor_history_body:old', 'sync-exchange:keep', 'editorXhistory:keep']) {
    db.prepare('INSERT INTO node_version_local_holds VALUES (?,?,?,?)').run(id, 'topic', 'base', now);
  }
  const reopened = await reopenSearchLibrary(library.root, now);
  expect(await loadCompanionEditHistory()).toEqual(createEmptyEditorOperationHistory());
  expect(reopened.db.prepare("SELECT value FROM companion_meta WHERE key='editor_operation_history'").get()).toBeUndefined();
  expect(reopened.db.prepare('SELECT hold_id FROM node_version_local_holds ORDER BY hold_id').all())
    .toEqual([{ hold_id: 'editorXhistory:keep' }, { hold_id: 'sync-exchange:keep' }]);
  expect(reopened.db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
  expect(await readCompanionContentSource('topic')).toMatchObject({ content: 'Saved', versionId: 'edited' });
});

it('publishes both sequential writer operations without saving an undo payload', async () => {
  await Promise.all(['one', 'two'].map(id => writeIosCompanionDatabase(db => db.transaction(tx => append(tx, id)))));
  expect(getEditorOperationSession(await loadCompanionEditHistory(), 'topic').undoStack).toHaveLength(2);
  expect(library.database.prepare("SELECT count(*) AS n FROM companion_meta WHERE key IN ('one','two')").get()).toEqual({ n: 2 });
  expect(library.database.prepare("SELECT value FROM companion_meta WHERE key='editor_operation_history'").get()).toBeUndefined();
});

it('discards a staged history when later work in the outer transaction fails', async () => {
  await expect(writeIosCompanionDatabase(db => db.transaction(async tx => {
    await append(tx, 'failed');
    throw new Error('later mutation failed');
  }))).rejects.toThrow('later mutation failed');
  expect(await loadCompanionEditHistory()).toEqual(createEmptyEditorOperationHistory());
  expect(library.database.prepare("SELECT value FROM companion_meta WHERE key='failed'").get()).toBeUndefined();
});

it('keeps SQL and candidate history together when an inner error is caught and the outer transaction commits', async () => {
  await writeIosCompanionDatabase(db => db.transaction(async tx => {
    try {
      await tx.transaction(async nested => {
        expect(nested).toBe(tx);
        await append(nested, 'nested');
        throw new Error('caught without savepoint');
      });
    } catch { /* The production port has no nested savepoint. */ }
    expect(getEditorOperationSession(await readCompanionEditHistoryFromDb(tx), 'topic').undoStack).toHaveLength(1);
  }));
  expect(getEditorOperationSession(await loadCompanionEditHistory(), 'topic').undoStack).toHaveLength(1);
  expect(library.database.prepare("SELECT value FROM companion_meta WHERE key='nested'").get()).toEqual({ value: 'committed' });
});

it('does not publish a candidate when SQLite commit itself fails', async () => {
  vi.spyOn(library.connection, 'commitTransaction').mockRejectedValueOnce(new Error('commit failed'));
  await expect(writeIosCompanionDatabase(db => db.transaction(tx => append(tx, 'commit-failed')))).rejects.toThrow('commit failed');
  expect(await loadCompanionEditHistory()).toEqual(createEmptyEditorOperationHistory());
  expect(library.database.prepare("SELECT value FROM companion_meta WHERE key='commit-failed'").get()).toBeUndefined();
  await writeIosCompanionDatabase(db => db.transaction(tx => append(tx, 'retry')));
  expect(getEditorOperationSession(await loadCompanionEditHistory(), 'topic').undoStack).toHaveLength(1);
});

it('refuses an undo queued in an earlier content lifetime', async () => {
  await writeIosCompanionDatabase(db => db.transaction(tx => append(tx, 'before-switch')));
  const history = await loadCompanionEditHistory();
  const gate = Promise.withResolvers<void>();
  const blocker = runCompanionSyncWriterTask(() => gate.promise);
  const undo = applyCompanionEditHistory('topic', 'undo');
  const rejected = expect(undo).rejects.toThrow('editor_history_context_changed');
  invalidateCompanionReadingScope();
  gate.resolve();
  await blocker;
  await rejected;
  expect(await loadCompanionEditHistory()).toEqual(history);
  expect(await readCompanionContentSource('topic')).toMatchObject({ content: 'Original', versionId: 'base' });
});

it('clears committed editing history even when the subsequent reload needs a fresh host bootstrap', async () => {
  await writeIosCompanionDatabase(db => db.transaction(tx => append(tx, 'before-clear')));
  expect(getEditorOperationSession(await loadCompanionEditHistory(), 'topic').undoStack).toHaveLength(1);
  await expect(clearIosCompanionActiveData()).rejects.toThrow('Companion Host is unavailable.');
  expect(await loadCompanionEditHistory()).toEqual(createEmptyEditorOperationHistory());
  expect(library.database.prepare("SELECT id FROM nodes WHERE id='topic'").get()).toBeUndefined();
});
