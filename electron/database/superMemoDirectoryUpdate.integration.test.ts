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
import { moveNodes, updateNodeAnchorLinks } from './nodeMutations.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { sendReviews } from './reviewProjection.testSupport.js';

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

function anchorFixtureElements() {
  const sourceText = 'Opening. Strong opening sentence. Secret word. Duplicate text. Manual selection.';
  const destinationText = 'Different introduction. Strong opening sentence. Secret word. Duplicate text. Duplicate text. Manual selection.';
  const material = (id: number, text: string): SuperMemoXmlDraftElement => ({
    ...topic, id, parentId: 1, title: `Selection ${id}`, bodyOrQuestionHtml: [text]
  });
  return [
    { ...topic, children: [3, 4, 5, 6], bodyOrQuestionHtml: [sourceText] },
    material(3, 'Strong opening sentence.'),
    { ...material(4, '<span class="cloze">[...]</span> word.'), sourceType: 'Item', answerHtml: ['Secret'] },
    material(5, 'Duplicate text.'),
    material(6, 'Manual selection.'),
    { ...topic, id: 2, title: 'Destination', bodyOrQuestionHtml: [destinationText] }
  ];
}

it('moves uniquely matched highlights and clozes and leaves ambiguous or edited selections in place', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const replica = fixture.peer('target');
  const anchoredElements = anchorFixtureElements();
  const rows = describeSuperMemoSource(anchoredElements, '+00:00', scheduler, gradeMap);
  const initial = { referenceDay: '2026-11-16', rows };
  const next = { ...initial, rows: rows.map(row => row.id >= 3 ? { ...row, parentId: 2 } : row) };
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    await runSuperMemoImport({ elements: anchoredElements, preview: initial, percent: 0, offset: '+00:00',
      gradeMap, scheduler, sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT, expectedImages: new Map() });
    const read = (title: string) => peer.sqlite.prepare('SELECT id, parent_id, anchor_link, content FROM nodes WHERE title = ?')
      .get(title) as { id: string; parent_id: string; anchor_link: string; content: string };
    const old = [3, 4, 5, 6].map(id => read(`Selection ${id}`));
    expect(old.map(node => JSON.parse(node.anchor_link).kind)).toEqual(['highlight', 'cloze', 'highlight', 'highlight']);
    const publish = async (id: string) => {
      flushNodeSyncVersionWithDriver(connection.driver!, id, peer.id);
      await sendReviews(peer, replica, true, [], id);
    };
    for (const id of [read('Source A').id, read('Destination').id, old[0]!.id, old[1]!.id]) await publish(id);
    const manual = JSON.parse(old[3]!.anchor_link);
    manual.id = 'manual-anchor';
    updateNodeAnchorLinks([{ nodeId: old[3]!.id, anchorLink: manual, updatedAt: new Date().toISOString() }]);
    const planned = updateSuperMemoDirectories(anchoredElements, next)!;
    expect(planned.changes).toMatchObject([
      { sourceId: 3, status: 'move', reanchor: true }, { sourceId: 4, status: 'move', reanchor: true },
      { sourceId: 5, status: 'anchor-unverified' }, { sourceId: 6, status: 'protected' }
    ]);
    expect(read('Selection 3')).toEqual(old[0]);
    updateSuperMemoDirectories(anchoredElements, next, planned.signature);
    peer.reopen();
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    const destination = read('Destination');
    for (const [index, id] of [3, 4].entries()) {
      const child = read(`Selection ${id}`);
      const before = JSON.parse(old[index]!.anchor_link);
      const after = JSON.parse(child.anchor_link);
      expect(child).toMatchObject({ id: old[index]!.id, parent_id: destination.id, content: old[index]!.content });
      expect(after).toMatchObject({ id: before.id, kind: before.kind });
      expect(after.locator.from).not.toBe(before.locator.from);
      expect(destination.content.slice(after.locator.from, after.locator.to)).toBe(before.locator.originalText);
      await publish(child.id);
      expect(replica.sqlite.prepare('SELECT parent_id, anchor_link FROM nodes WHERE id = ?').get(child.id))
        .toMatchObject({ parent_id: destination.id, anchor_link: child.anchor_link });
    }
    expect(read('Selection 5')).toEqual(old[2]);
    expect(read('Selection 6')).toMatchObject({ id: old[3]!.id, parent_id: old[3]!.parent_id, anchor_link: JSON.stringify(manual) });
    expect(updateSuperMemoDirectories(anchoredElements, next)?.changes.map(change => change.sourceId)).toEqual([5, 6]);
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});
