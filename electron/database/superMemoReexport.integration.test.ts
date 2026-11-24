// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../lib/core/import/superMemoSchedulePreview.js';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT } from '../../lib/core/import/superMemoSourceFormatting.js';
import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { runSuperMemoImport } from '../import/runSuperMemoImport.js';
import { confirmSuperMemoDirectoryUpdate, updateSuperMemoDirectories } from '../import/updateSuperMemoDirectories.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection }));

const card = (id: number, text: string): SuperMemoXmlDraftElement => ({
  id, parentId: null, children: [], sourceType: 'Item', title: `Card ${id}`, ordinal: null,
  bodyOrQuestionHtml: [text], answerHtml: ['Answer'], skippedAudioComponents: 0, learning: null
});
const event = (repetition: number) => ({ date: `0${repetition}.11.2026`, hour: '12', grade: 4, repetition, lapses: 0, raw: '' });
const learned = {
  lastRepetition: '02.11.2026', intervalDays: '30', repetitions: '2', lapses: '0',
  sourceAFactor: null, sourceUFactor: null, history: [event(1), event(2)]
};
const directory: SuperMemoXmlDraftElement = {
  ...card(8, ''), sourceType: 'Concept', title: 'Original directory',
  bodyOrQuestionHtml: [], answerHtml: [], children: [1, 2]
};
const original = [directory, { ...card(1, 'Unchanged question'), parentId: 8 },
  { ...card(2, 'Old second question'), parentId: 8, learning: learned },
  card(3, 'Original used number'), card(4, 'Moved with its number changed')];
const newer = [{ ...directory, children: [1, 2, 6] }, original[1]!,
  { ...card(2, 'Revised second question'), parentId: 8, learning: { ...learned, history: [...learned.history, event(3)] } },
  { ...card(6, 'A genuinely new question'), parentId: 8 },
  card(3, 'Different material using this number'), card(5, 'Moved with its number changed')];
const base = { percent: 0, offset: '+00:00', scheduler: DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  gradeMap: DEFAULT_SUPER_MEMO_GRADE_MAP, sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT, expectedImages: new Map<string, string | null>() };
function input(elements: SuperMemoXmlDraftElement[]) {
  return { ...base, elements, preview: { referenceDay: '2026-11-16',
    rows: describeSuperMemoSource(elements, base.offset, base.scheduler, base.gradeMap) } };
}

function priorityUpdateInput() {
  const current = input(newer);
  const rows = current.preview.rows.map(row => row.id === 2 || row.id === 6
    ? { ...row, sourcePriorityPercent: 20 } : row);
  return { ...current, preview: { ...current.preview, rows },
    priorityBoundaries: [0, 11, 20, 33, 44, 56, 67, 78, 89, 100] };
}

it.each(['tracked', 'legacy'])('verifies a new export against the %s original batch before updating or adding entries', async (format) => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const bind = () => {
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  };
  const row = (title: string) => peer.sqlite.prepare('SELECT id, content, parent_id, deleted_at, priority FROM nodes WHERE title = ?').get(title) as
    { id: string; content: string; parent_id: string; deleted_at: string | null; priority: number } | undefined;
  const plan = (args: ReturnType<typeof input>, target = {}) =>
    updateSuperMemoDirectories(args.elements, args.preview, undefined, undefined, { ...args, ...target })!;
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    bind();
    const { batchId } = await runSuperMemoImport(input(original));
    if (format === 'legacy') peer.sqlite.prepare(`UPDATE workspace_meta SET value = (
      SELECT json_set(workspace_meta.value, '$.entries', json_group_array(json_remove(entry.value, '$.sourceEvidence')))
      FROM json_each(workspace_meta.value, '$.entries') AS entry
    ) WHERE key = ?`).run(`supermemo-import:${batchId}`);
    const target = { targetBatchId: batchId, ...(format === 'legacy' ? { originalElements: original } : {}) };
    const revised = { ...priorityUpdateInput(), ...target };
    const wrong = input([card(1, 'Foreign one'), card(2, 'Foreign two'), card(3, 'Foreign three')]);
    const rejected = plan(wrong, target);
    expect(rejected.sourceMatch?.status).toBe('unverified');
    await expect(confirmSuperMemoDirectoryUpdate({ ...wrong, ...target }, rejected.signature)).rejects.toThrow('supermemo_update_changed');
    const comparison = plan(revised, target);
    expect(comparison.sourceMatch).toMatchObject({ status: 'verified', matched: 3, additions: 1,
      conflicts: [{ sourceId: 3, reason: 'number-conflict' }, { sourceId: 5, reason: 'renumbered' }] });
    expect(comparison.changes).toMatchObject([{ sourceId: 6, status: 'add' }]);
    expect(comparison.priorityChanges).toEqual([{ sourceId: 2, title: 'Card 2', from: 5, to: 3, status: 'update' }]);
    const originalCard = row('Card 2');
    expect(await confirmSuperMemoDirectoryUpdate(revised, comparison.signature)).toMatchObject({ batchId, imported: 6 });
    peer.reopen();
    bind();
    expect(row('Card 2')).toEqual({ ...originalCard, content: 'Revised second question', priority: 3 });
    expect(row('Card 3')?.content).toBe('Original used number');
    expect(row('Card 4')?.deleted_at).toBeNull();
    expect(row('Card 5')).toBeUndefined();
    expect(row('Card 6')).toMatchObject({ content: 'A genuinely new question', parent_id: row('Original directory')!.id, priority: 3 });
    expect(plan(input(newer))).toMatchObject({ batchId, changes: [], sourceMatch: { status: 'verified', additions: 0 } });
    expect(plan(input(original)).sourceMatch?.status).toBe('older-export');
    await expect(runSuperMemoImport(input(newer))).rejects.toThrow('supermemo_update_preview_required');
    const next = { ...input([...newer, card(7, 'Added in a later export'), card(9, 'Unchanged question')]), targetBatchId: batchId };
    const nextPlan = plan(next, { targetBatchId: batchId });
    const addedCard = row('Card 6');
    expect(nextPlan.sourceMatch).toMatchObject({ status: 'verified', additions: 1 });
    expect(nextPlan.sourceMatch?.conflicts).toEqual(expect.arrayContaining([
      { sourceId: 1, title: 'Card 1', reason: 'number-conflict' }, { sourceId: 9, title: 'Card 9', reason: 'renumbered' }
    ]));
    await confirmSuperMemoDirectoryUpdate(next, nextPlan.signature);
    expect(row('Card 6')).toEqual(addedCard);
    expect(row('Card 7')?.content).toBe('Added in a later export');
    expect(row('Card 9')).toBeUndefined();
    expect(plan(input(newer)).sourceMatch?.status).toBe('older-export');
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});
