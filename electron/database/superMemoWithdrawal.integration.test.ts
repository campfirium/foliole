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
import { restoreNodes } from './nodeMutations.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { score, sendReviews } from './reviewProjection.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection }));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({
  inspectFoliolePublishedDelete: () => ({ status: 'allowed' }),
  assertFoliolePublishedDeleteAllowed: () => undefined
}));

const topic: SuperMemoXmlDraftElement = {
  id: 4, parentId: null, children: [5], sourceType: 'Topic', title: 'Parent', ordinal: null,
  bodyOrQuestionHtml: ['Article'], answerHtml: [], skippedAudioComponents: 0, learning: null
};
const card = (id: number): SuperMemoXmlDraftElement => ({ ...topic, id, children: [], sourceType: 'Item',
  title: `Card ${id}`, bodyOrQuestionHtml: ['Question'], answerHtml: ['Answer'] });
const elements = [card(1), card(2), card(3), topic, { ...card(5), parentId: 4 }, card(6)];
const input = { elements, percent: 0, offset: '+00:00', gradeMap: DEFAULT_SUPER_MEMO_GRADE_MAP,
  scheduler: DEFAULT_REVIEW_SCHEDULER_SETTINGS, sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT, expectedImages: new Map<string, string | null>() };
const initial = { referenceDay: '2026-11-16', rows: describeSuperMemoSource(elements, input.offset, input.scheduler, input.gradeMap) };
const revised = {
  ...initial, rows: initial.rows.filter(row => row.id < 5).map(row => row.id <= 4
    ? { ...row, outcome: 'skipped' as const, issue: row.id === 4 ? 'empty-topic' as const : 'empty-item' as const } : row)
};

it('withdraws only explicitly selected safe materials and keeps them recoverable', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const replica = fixture.peer('target');
  const bind = () => {
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  };
  const read = (title: string) => peer.sqlite.prepare('SELECT id, deleted_at, content FROM nodes WHERE title = ?')
    .get(title) as { id: string; deleted_at: string | null; content: string };
  const plan = () => updateSuperMemoDirectories(elements, revised, undefined, undefined, input)!;
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    bind();
    const { batchId } = await runSuperMemoImport({ ...input, preview: initial });
    const pristine = read('Card 1');
    applyParentContentChange({ driver: connection.driver!, nodeId: read('Card 2').id,
      nextContent: 'Edited question', updatedAt: '2026-11-17' });
    const oldPreview = plan();
    score(peer, 'reviewed', new Date().toISOString(), 3, read('Card 3').id);
    await expect(confirmSuperMemoDirectoryUpdate({ ...input, preview: revised }, oldPreview.signature, [1, 3]))
      .rejects.toThrow('supermemo_update_changed');
    const eligible = plan();
    expect(eligible.withdrawals).toEqual([
      expect.objectContaining({ sourceId: 1, issue: 'empty-item' }),
      expect.objectContaining({ sourceId: 2, protectedBy: 'modified' }),
      expect.objectContaining({ sourceId: 3, protectedBy: 'modified' }),
      expect.objectContaining({ sourceId: 4, protectedBy: 'children' })
    ]);
    expect(eligible.withdrawals[0]?.protectedBy).toBeUndefined();
    await confirmSuperMemoDirectoryUpdate({ ...input, preview: revised }, eligible.signature);
    expect(read('Card 1')).toEqual(pristine);
    await expect(confirmSuperMemoDirectoryUpdate({ ...input, preview: revised }, eligible.signature, [1, 6]))
      .rejects.toThrow('supermemo_withdrawal_changed');
    expect(await confirmSuperMemoDirectoryUpdate({ ...input, preview: revised }, eligible.signature, [1]))
      .toMatchObject({ batchId, withdrawnSourceIds: [1] });
    peer.reopen();
    bind();
    expect(read('Card 1')).toMatchObject({ id: pristine.id, deleted_at: expect.any(String), content: pristine.content });
    for (const title of ['Card 2', 'Card 3', 'Parent', 'Card 5', 'Card 6']) expect(read(title).deleted_at).toBeNull();
    await sendReviews(peer, replica, true, [], pristine.id);
    expect(replica.sqlite.prepare('SELECT deleted_at FROM nodes WHERE id = ?').pluck().get(pristine.id)).toBe(read('Card 1').deleted_at);
    expect(restoreNodes({ nodeIds: [pristine.id] }).restoredNodeIds).toEqual([pristine.id]);
    expect(read('Card 1')).toEqual(pristine);
    expect(plan().withdrawals.some(candidate => candidate.sourceId === 1)).toBe(false);
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});
