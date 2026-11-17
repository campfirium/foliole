// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../lib/core/import/superMemoSchedulePreview.js';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT } from '../../lib/core/import/superMemoSourceFormatting.js';
import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { runSuperMemoImport } from '../import/runSuperMemoImport.js';
import { confirmSuperMemoDirectoryUpdate, updateSuperMemoDirectories } from '../import/updateSuperMemoDirectories.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { updateNodeAnchorLinks } from './nodeMutations.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { sendReviews } from './reviewProjection.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => connection
}));

const topic: SuperMemoXmlDraftElement = {
  id: 1, parentId: null, children: [], sourceType: 'Topic', title: 'Source A', ordinal: null,
  bodyOrQuestionHtml: ['A separate source text.'], answerHtml: [], skippedAudioComponents: 0, learning: null
};
const scheduler = DEFAULT_REVIEW_SCHEDULER_SETTINGS;
const gradeMap = DEFAULT_SUPER_MEMO_GRADE_MAP;

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

function anchorUpdateFixture(parent: string) {
  const anchoredElements = anchorFixtureElements();
  const rows = describeSuperMemoSource(anchoredElements, '+00:00', scheduler, gradeMap);
  const initial = { referenceDay: '2026-11-16', rows: rows.map(row => parent === 'missing' && row.id === 2
    ? { ...row, outcome: 'skipped' as const } : row) };
  const next = { ...initial, rows: rows.map(row => row.id >= 3 ? { ...row, parentId: 2 } : row) };
  const input = { elements: anchoredElements, percent: 0, offset: '+00:00',
    gradeMap, scheduler, sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT, expectedImages: new Map<string, string | null>() };
  return { anchoredElements, initial, next, input };
}

it.each(['present', 'missing'])('preserves anchors when the corrected parent is %s', async (parent) => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const replica = fixture.peer('target');
  const { anchoredElements, initial, next, input } = anchorUpdateFixture(parent);
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    await runSuperMemoImport({ ...input, preview: initial });
    const read = (title: string) => peer.sqlite.prepare('SELECT id, parent_id, anchor_link, content FROM nodes WHERE title = ?')
      .get(title) as { id: string; parent_id: string; anchor_link: string; content: string };
    const old = [3, 4, 5, 6].map(id => read(`Selection ${id}`));
    expect(old.map(node => JSON.parse(node.anchor_link).kind)).toEqual(['highlight', 'cloze', 'highlight', 'highlight']);
    const publish = async (id: string) => {
      flushNodeSyncVersionWithDriver(connection.driver!, id, peer.id);
      await sendReviews(peer, replica, true, [], id);
    };
    for (const id of [read('Source A').id, old[0]!.id, old[1]!.id]) await publish(id);
    if (parent === 'present') await publish(read('Destination').id);
    const manual = JSON.parse(old[3]!.anchor_link);
    manual.id = 'manual-anchor';
    updateNodeAnchorLinks([{ nodeId: old[3]!.id, anchorLink: manual, updatedAt: new Date().toISOString() }]);
    const planned = updateSuperMemoDirectories(anchoredElements, next, undefined, undefined, input)!;
    if (parent === 'missing') expect(planned.changes[0]).toMatchObject({ sourceId: 2, status: 'add' });
    expect(planned.changes.filter(change => change.status !== 'add')).toMatchObject([
      { sourceId: 3, status: 'move', reanchor: true }, { sourceId: 4, status: 'move', reanchor: true },
      { sourceId: 5, status: 'anchor-unverified' }, { sourceId: 6, status: 'protected' }
    ]);
    expect(read('Selection 3')).toEqual(old[0]);
    await confirmSuperMemoDirectoryUpdate({ ...input, preview: next }, planned.signature);
    peer.reopen();
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    const destination = read('Destination');
    if (parent === 'missing') await publish(destination.id);
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

async function rejectStaleAnchorPreview(input: Parameters<typeof confirmSuperMemoDirectoryUpdate>[0],
  destination: { id: string; content: string }, signature: string) {
  const changeDestination = (nextContent: string) => applyParentContentChange({
    driver: connection.driver!, nodeId: destination.id, nextContent, updatedAt: new Date().toISOString()
  });
  changeDestination('The user removed the excerpted sentence.');
  await expect(confirmSuperMemoDirectoryUpdate(input, signature)).rejects.toThrow('supermemo_update_changed');
  changeDestination(destination.content);
}

it.each([false, true])('restores a missing anchor without replacing the material (already moved: %s)', async alreadyMoved => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const replica = fixture.peer('target');
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    const passage = 'This selection stays with the true source.';
    const elements = [
      { ...topic, children: [3] },
      { ...topic, id: 3, parentId: 1, title: 'Moved excerpt', bodyOrQuestionHtml: [passage] },
      { ...topic, id: 2, title: 'Destination', bodyOrQuestionHtml: [`Opening. ${passage}`] }
    ];
    const rows = describeSuperMemoSource(elements, '+00:00', scheduler, gradeMap);
    const initial = { referenceDay: '2026-11-16', rows };
    const next = { ...initial, rows: rows.map(row => row.id === 3 ? { ...row, sourceArticleId: 2 } : row) };
    const input = { elements, percent: 0, offset: '+00:00', gradeMap, scheduler, sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT,
      expectedImages: new Map<string, string | null>() };
    await runSuperMemoImport({ ...input, preview: initial });
    if (alreadyMoved) {
      // Exercise the previous directory-only update before enabling source-based anchor recovery.
      const oldPlan = updateSuperMemoDirectories(elements, next)!;
      updateSuperMemoDirectories(elements, next, oldPlan.signature);
    }
    const readExcerpt = () => peer.sqlite.prepare('SELECT id, parent_id, anchor_link FROM nodes WHERE title = ?')
      .get('Moved excerpt') as { id: string; parent_id: string; anchor_link: string | null };
    const before = readExcerpt();
    expect(before.anchor_link).toBeNull();
    const destination = peer.sqlite.prepare('SELECT id, content FROM nodes WHERE title = ?').get('Destination') as { id: string; content: string };
    const planned = updateSuperMemoDirectories(elements, next, undefined, undefined, input)!;
    expect(planned.changes).toMatchObject([{ sourceId: 3, status: alreadyMoved ? 'anchor' : 'move', restoreAnchor: true }]);
    expect(readExcerpt()).toEqual(before);
    await rejectStaleAnchorPreview({ ...input, preview: next }, destination, planned.signature);
    expect(readExcerpt()).toEqual(before);
    const current = updateSuperMemoDirectories(elements, next, undefined, undefined, input)!;
    await confirmSuperMemoDirectoryUpdate({ ...input, preview: next }, current.signature);
    peer.reopen();
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    const after = readExcerpt();
    expect(after).toMatchObject({ id: before.id, parent_id: destination.id });
    const restored = JSON.parse(after.anchor_link!);
    expect(restored).toMatchObject({ kind: 'highlight', locator: { originalText: passage } });
    expect(destination.content.slice(restored.locator.from, restored.locator.to)).toBe(passage);
    expect(updateSuperMemoDirectories(elements, next, undefined, undefined, input)?.changes).toEqual([]);
    for (const id of [destination.id, after.id]) {
      flushNodeSyncVersionWithDriver(connection.driver!, id, peer.id);
      await sendReviews(peer, replica, true, [], id);
    }
    expect(replica.sqlite.prepare('SELECT parent_id, anchor_link FROM nodes WHERE id = ?').get(after.id))
      .toMatchObject({ parent_id: destination.id, anchor_link: after.anchor_link });
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});
