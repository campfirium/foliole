// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../lib/core/import/superMemoSchedulePreview.js';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT } from '../../lib/core/import/superMemoSourceFormatting.js';
import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { runSuperMemoImport } from '../import/runSuperMemoImport.js';
import { updateSuperMemoDirectories } from '../import/updateSuperMemoDirectories.js';
import { handleSuperMemoImportCommand } from '../ipc/superMemoImportCommands.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { moveNodes } from './nodeMutations.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

const topic: SuperMemoXmlDraftElement = {
  id: 1, parentId: null, children: [], sourceType: 'Topic', title: 'Source A', ordinal: null,
  bodyOrQuestionHtml: ['A separate source text.'], answerHtml: [], skippedAudioComponents: 0, learning: null
};
const elements: SuperMemoXmlDraftElement[] = [topic, { ...topic, id: 2, title: 'Source B' },
  ...[3, 4].map(id => ({ ...topic, id, title: `Card ${id}`, sourceType: 'Item',
    bodyOrQuestionHtml: ['Question'], answerHtml: ['Answer'] }))];
const scheduler = DEFAULT_REVIEW_SCHEDULER_SETTINGS;
const gradeMap = DEFAULT_SUPER_MEMO_GRADE_MAP;

function preview(article: number | null): NativeSuperMemoPreview {
  return { referenceDay: '2026-11-16', pairedCollection: article !== null,
    rows: describeSuperMemoSource(elements, '+00:00', scheduler, gradeMap).map(row => ({
      ...row, ...(row.id > 2 && article !== null ? { sourceArticleId: article } : {})
    })) };
}

function manuallyMove(card: { id: string; parent_id: string }, target: string) {
  const driver = connection.driver!;
  const sourceOrder = readMoveParentOrder(driver, card.parent_id).visibleIds;
  const targetOrder = readMoveParentOrder(driver, target).visibleIds;
  moveNodes({ nodes: [{ nodeId: card.id, expectedParentNodeId: card.parent_id, parentNodeId: target,
    updatedAt: new Date().toISOString() }],
  parentOrders: [
    { parentNodeId: card.parent_id, expectedChildIds: sourceOrder, childIds: sourceOrder.filter(id => id !== card.id) },
    { parentNodeId: target, expectedChildIds: targetOrder, childIds: [...targetOrder, card.id] }
  ], maintainSequentialReading: false, defaultPriority: 5 });
}

it.each(['current', 'legacy'])('updates the same nodes across rule changes in a %s batch', async (format) => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const bind = () => {
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  };
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    bind();
    const result = await runSuperMemoImport({ elements, preview: preview(null), percent: 0, offset: '+00:00', gradeMap, scheduler,
      sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT, expectedImages: new Map() });
    if (format === 'legacy') {
      peer.sqlite.prepare(`UPDATE workspace_meta SET value = (
        SELECT json_set(workspace_meta.value, '$.entries', json_group_array(json_remove(entry.value, '$.importedParentNodeId')))
        FROM json_each(workspace_meta.value, '$.entries') AS entry
      ) WHERE key = ?`).run(`supermemo-import:${result.batchId}`);
    }
    const node = (title: string) => peer.sqlite.prepare('SELECT id, parent_id, reveal FROM nodes WHERE title = ?')
      .get(title) as { id: string; parent_id: string; reveal: string | null };
    const original = node('Card 3');
    const first = updateSuperMemoDirectories(elements, preview(1))!;
    expect(first.changes).toMatchObject([{ sourceId: 3, status: 'move' }, { sourceId: 4, status: 'move' }]);
    expect(node('Card 3')).toEqual(original);
    updateSuperMemoDirectories(elements, preview(1), first.signature);
    expect(node('Card 3')).toEqual({ ...original, parent_id: node('Source A').id });
    expect(updateSuperMemoDirectories(elements, preview(null))).toMatchObject({ pairedSourceRequired: true, changes: [] });
    peer.reopen();
    bind();
    const second = updateSuperMemoDirectories(elements, preview(2))!;
    expect(second.changes).toMatchObject([{ sourceId: 3, status: 'move' }, { sourceId: 4, status: 'move' }]);
    manuallyMove(node('Card 4'), node('Source B').id);
    expect(() => updateSuperMemoDirectories(elements, preview(2), second.signature)).toThrow('supermemo_update_changed');
    const refreshed = updateSuperMemoDirectories(elements, preview(2))!;
    expect(refreshed.changes).toMatchObject([{ sourceId: 3, status: 'move' }]);
    updateSuperMemoDirectories(elements, preview(2), refreshed.signature);
    const third = updateSuperMemoDirectories(elements, preview(1))!;
    expect(third.changes).toMatchObject([{ sourceId: 3, status: 'move' }, { sourceId: 4, status: 'protected' }]);
    expect(node('Card 3')).toEqual({ ...original, parent_id: node('Source B').id });
    updateSuperMemoDirectories(elements, preview(1), third.signature);
    expect(node('Card 3')).toEqual({ ...original, parent_id: node('Source A').id });
    expect(node('Card 4').parent_id).toBe(node('Source B').id);
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});


it('imports a previously skipped parent before moving its existing child, without creating a duplicate', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const bind = () => {
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  };
  const originalElements = [
    { ...topic, children: [3] },
    { ...elements[2]!, parentId: 1 }
  ];
  const args = { elements: originalElements, percent: 0 };
  const load = async () => {
    const result = await handleSuperMemoImportCommand(NATIVE_COMMANDS.previewSuperMemoImport, args);
    if (!result || !('rows' in result)) throw new Error('missing import preview');
    return result;
  };
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    bind();
    const before = await load();
    // Exercise the real writer with the old rule's outcome for the same export.
    await runSuperMemoImport({ ...args, preview: { ...before, rows: before.rows.map(row => row.id === 1
      ? { ...row, outcome: 'skipped' } : row) }, offset: '+00:00', gradeMap, scheduler,
    sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT, expectedImages: new Map() });
    const nodes = () => peer.sqlite.prepare('SELECT id, title, parent_id, reveal FROM nodes WHERE title IN (?, ?) ORDER BY title')
      .all('Card 3', 'Source A') as Array<{ id: string; title: string; parent_id: string; reveal: string | null }>;
    const [originalCard] = nodes();
    expect(originalCard?.title).toBe('Card 3');
    const next = await load();
    expect(next.directoryUpdate?.changes).toMatchObject([
      { sourceId: 1, title: 'Source A', status: 'add' }, { sourceId: 3, to: 'Source A', status: 'move' }
    ]);
    expect(nodes()).toEqual([originalCard]);
    const update = { ...args, previewSignature: next.previewSignature, updateSignature: next.directoryUpdate?.signature };
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, update)).toMatchObject({ imported: 2, skipped: 0 });
    peer.reopen();
    bind();
    const [card, parent] = nodes();
    expect(parent?.title).toBe('Source A');
    expect(card).toEqual({ ...originalCard, parent_id: parent?.id });
    expect((await load()).directoryUpdate?.changes).toEqual([]);
    await expect(handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, update)).rejects.toThrow('supermemo_update_changed');
    expect(nodes()).toEqual([card, parent]);
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});
