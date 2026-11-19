// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { restoreNodes, softDeleteNodes } from '../../lib/core/database/nodeMutations.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../lib/core/import/superMemoSchedulePreview.js';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT } from '../../lib/core/import/superMemoSourceFormatting.js';
import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { readSuperMemoDeletions } from '../import/readSuperMemoDeletions.js';
import { runSuperMemoImport } from '../import/runSuperMemoImport.js';
import { superMemoDueInstant } from '../import/superMemoImportSchedule.js';
import { confirmSuperMemoDirectoryUpdate, updateSuperMemoDirectories } from '../import/updateSuperMemoDirectories.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { syncWithAncestors } from './superMemoLearningJourney.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection }));

const root: SuperMemoXmlDraftElement = {
  id: 1, parentId: null, children: [2], sourceType: 'Topic', title: 'Article', ordinal: null,
  bodyOrQuestionHtml: ['Opening. A secret passage.'], answerHtml: [], skippedAudioComponents: 0, learning: null
};
const card: SuperMemoXmlDraftElement = { ...root, id: 2, children: [], parentId: 1, title: 'Missing card', sourceType: 'Item',
  bodyOrQuestionHtml: ['A <span class="cloze">[...]</span> passage.'], answerHtml: ['secret'] };
const elements = [root, card, { ...root, id: 3, children: [], title: 'Missing standalone topic' },
  { ...root, id: 4, children: [5], title: 'Deleted article' }, { ...card, id: 5, parentId: 4, title: 'Blocked card' }];
const gradeMap = DEFAULT_SUPER_MEMO_GRADE_MAP;
const scheduler = DEFAULT_REVIEW_SCHEDULER_SETTINGS;
const offset = '+00:00';
const input = { elements, percent: 0, offset, gradeMap, scheduler,
  sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT, expectedImages: new Map<string, string | null>() };
const rows = describeSuperMemoSource(elements, offset, scheduler, gradeMap)
  .map(row => row.id === 2 ? { ...row, sourceDue: '2027-01-06' } : row);
const revised = { referenceDay: '2026-11-16', rows };
const historical = { ...revised, rows: revised.rows.map(row => [2, 3, 5].includes(row.id) ? { ...row, outcome: 'skipped' as const } : row) };

it('adds skipped materials once and preserves the placement of recovered cards', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const replica = fixture.peer('target');
  const bind = () => {
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  };
  const read = (title: string) => peer.sqlite.prepare('SELECT id, parent_id, anchor_link, deleted_at FROM nodes WHERE title = ?').get(title) as
    { id: string; parent_id: string; anchor_link: string; deleted_at: string | null } | undefined;
  const plan = () => updateSuperMemoDirectories(elements, revised, undefined, undefined, input)!;
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    bind();
    const old = await runSuperMemoImport({ ...input, preview: historical });
    const deleted = read('Deleted article')!.id;
    softDeleteNodes(connection.driver!, { nodeIds: [deleted], deletedAt: new Date().toISOString() });
    const before = plan();
    expect(before.changes).toMatchObject([
      { sourceId: 2, to: 'Article', status: 'add' }, { sourceId: 3, status: 'add' }, { sourceId: 5, status: 'add-unavailable' }
    ]);
    expect(read('Missing card')).toBeUndefined();
    const result = await confirmSuperMemoDirectoryUpdate({ ...input, preview: revised }, before.signature);
    expect(result).toMatchObject({ batchId: old.batchId, imported: 4, skipped: 1 });
    peer.reopen();
    bind();
    const recovered = read('Missing card')!;
    expect(recovered.parent_id).toBe(read('Article')?.id);
    expect(JSON.parse(recovered.anchor_link)).toMatchObject({ kind: 'cloze', locator: { originalText: 'secret' } });
    expect(peer.sqlite.prepare('SELECT due FROM node_review WHERE node_id = ?').pluck().get(recovered.id))
      .toBe(superMemoDueInstant('2027-01-06'));
    expect(read('Missing standalone topic')).toBeDefined();
    expect(read('Blocked card')).toBeUndefined();
    expect(read('Deleted article')).toMatchObject({ id: deleted, deleted_at: expect.any(String) });
    expect(plan().changes).toMatchObject([{ sourceId: 5, status: 'add-unavailable' }]);
    await expect(confirmSuperMemoDirectoryUpdate({ ...input, preview: revised }, before.signature))
      .rejects.toThrow('supermemo_update_changed');
    expect(peer.sqlite.prepare('SELECT COUNT(*) FROM nodes WHERE title = ?').pluck().get('Missing card')).toBe(1);
    for (const nodeId of [read('Article')!.id, recovered.id]) {
      await syncWithAncestors(peer, replica, nodeId);
    }
    expect(replica.sqlite.prepare('SELECT parent_id, anchor_link FROM nodes WHERE id = ?').get(recovered.id))
      .toMatchObject({ parent_id: recovered.parent_id, anchor_link: recovered.anchor_link });
    expect(replica.sqlite.prepare('SELECT due FROM node_review WHERE node_id = ?').pluck().get(recovered.id))
      .toBe(superMemoDueInstant('2027-01-06'));
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});

it('recovers an entirely skipped batch inside the SuperMemo folder', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const onlyCard = { ...card, parentId: null };
  const args = { ...input, elements: [onlyCard] };
  const [row] = describeSuperMemoSource([onlyCard], offset, scheduler, gradeMap);
  const draft = { referenceDay: revised.referenceDay, rows: [row!] };
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    await runSuperMemoImport({ ...args, preview: { ...draft, rows: [{ ...row!, outcome: 'skipped' }] } });
    expect(peer.sqlite.prepare("SELECT id FROM nodes WHERE id = 'special-inbox'").get()).toBeUndefined();
    const plan = updateSuperMemoDirectories(args.elements, draft, undefined, undefined, args)!;
    expect(plan.changes).toMatchObject([{ sourceId: 2, status: 'add' }]);
    expect(await confirmSuperMemoDirectoryUpdate({ ...args, preview: draft }, plan.signature)).toMatchObject({ imported: 1, skipped: 0 });
    expect(peer.sqlite.prepare(`SELECT p.title FROM nodes n JOIN nodes p ON p.id = n.parent_id
      WHERE n.title = ?`).pluck().get('Missing card')).toBe('SuperMemo');
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});

it('skips a previously imported Topic after trashing and permanently deleting it', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const topic = { ...root, children: [] };
  const args = { ...input, elements: [topic], preview: { ...revised, rows: rows.filter(row => row.id === topic.id) } };
  const bind = () => {
    const driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    connection.driver = driver;
    return driver;
  };
  const findTopic = () => peer.sqlite.prepare('SELECT id, deleted_at FROM nodes WHERE title = ?').get(topic.title) as
    { id: string; deleted_at: string | null } | undefined;
  const applySameExport = async () => {
    const plan = updateSuperMemoDirectories(args.elements, args.preview, undefined, undefined, args)!;
    await confirmSuperMemoDirectoryUpdate(args, plan.signature);
  };
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    const driver = bind();
    const imported = await runSuperMemoImport(args);
    const { id } = findTopic()!;
    const deleted = (driver: ReturnType<typeof bind>) => readSuperMemoDeletions(driver, imported.batchId);
    expect(deleted(driver)).toEqual([]);
    const deletedAt = '2026-11-17T12:00:00.000Z';
    softDeleteNodes(driver, { nodeIds: [id], deletedAt });
    await applySameExport();
    expect(findTopic()).toEqual({ id, deleted_at: deletedAt });
    expect(deleted(driver)).toEqual([{ sourceId: topic.id, title: topic.title, status: 'trash' }]);
    restoreNodes(driver, { nodeIds: [id] });
    await applySameExport();
    expect(findTopic()).toEqual({ id, deleted_at: null });
    expect(deleted(driver)).toEqual([]);
    softDeleteNodes(driver, { nodeIds: [id], deletedAt });
    peer.sqlite.exec("ATTACH DATABASE ':memory:' AS search");
    deleteNodesPermanently(driver, { nodeIds: [id], deletedAt });
    peer.reopen();
    const reopened = bind();
    await expect(runSuperMemoImport(args)).resolves.toMatchObject({ batchId: imported.batchId });
    await applySameExport();
    expect(findTopic()).toBeUndefined();
    expect(deleted(reopened)).toEqual([{ sourceId: topic.id, title: topic.title, status: 'permanent' }]);

    const added = { ...topic, id: 6, title: 'New reading', bodyOrQuestionHtml: ['A different passage.'] };
    const newer = [topic, added];
    const refresh = { ...args, elements: newer, targetBatchId: imported.batchId,
      preview: { ...args.preview, rows: describeSuperMemoSource(newer, offset, scheduler, gradeMap) } };
    const plan = updateSuperMemoDirectories(newer, refresh.preview, undefined, undefined, refresh)!;
    await confirmSuperMemoDirectoryUpdate(refresh, plan.signature);
    expect(peer.sqlite.prepare('SELECT title FROM nodes WHERE title = ?').pluck().get(added.title)).toBe(added.title);
    expect(findTopic()).toBeUndefined();
    expect(deleted(reopened)).toEqual([{ sourceId: topic.id, title: topic.title, status: 'permanent' }]);
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});
