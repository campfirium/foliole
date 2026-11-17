// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../lib/core/import/superMemoSchedulePreview.js';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT } from '../../lib/core/import/superMemoSourceFormatting.js';
import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { adjustSuperMemoImport } from '../import/adjustSuperMemoImport.js';
import { runSuperMemoImport } from '../import/runSuperMemoImport.js';
import { superMemoDueInstant } from '../import/superMemoImportSchedule.js';
import { confirmSuperMemoDirectoryUpdate, updateSuperMemoDirectories } from '../import/updateSuperMemoDirectories.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { score } from './reviewProjection.testSupport.js';
import { syncWithAncestors } from './superMemoLearningJourney.testSupport.js';

const state = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => state }));

const elements: SuperMemoXmlDraftElement[] = [1, 2, 3].map(id => ({
  id, parentId: null, children: [], sourceType: 'Item', title: `Card ${id}`, ordinal: null,
  bodyOrQuestionHtml: ['Question'], answerHtml: ['Answer'], skippedAudioComponents: 0, learning: null
}));
const input = { elements, offset: '+00:00', scheduler: DEFAULT_REVIEW_SCHEDULER_SETTINGS, gradeMap: DEFAULT_SUPER_MEMO_GRADE_MAP,
  sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT, expectedImages: new Map<string, string | null>() };
function preview(calculated: string) {
  return { referenceDay: '2026-11-16', rows: describeSuperMemoSource(elements, input.offset, input.scheduler, input.gradeMap)
    .map(row => ({ ...row, sourceDue: '2027-01-01', recalculatedDue: calculated })) };
}

it.each([0, 50])('refreshes first review calculations at the saved %s percent blend', async percent => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const replica = fixture.peer('target');
  const bind = () => {
    state.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(state.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  };
  const id = (title: string) => peer.sqlite.prepare('SELECT id FROM nodes WHERE title = ?').pluck().get(title) as string;
  const due = (nodeId: string) => peer.sqlite.prepare('SELECT due FROM node_review WHERE node_id = ?').pluck().get(nodeId);
  const revised = preview('2027-02-10');
  const plan = () => updateSuperMemoDirectories(elements, revised, undefined, undefined, input)!;
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    bind();
    const { batchId } = await runSuperMemoImport({ ...input, percent, preview: preview('2027-01-21') });
    const [eligible, manual, reviewed] = ['Card 1', 'Card 2', 'Card 3'].map(id) as [string, string, string];
    const original = due(eligible);
    const manualDue = superMemoDueInstant('2027-04-02');
    peer.sqlite.prepare('UPDATE node_review SET due = ? WHERE node_id = ?').run(manualDue, manual);
    const before = plan();
    expect(before.firstReviewChanges.map(change => change.status)).toEqual([percent ? 'update' : 'basis', 'protected', percent ? 'update' : 'basis']);
    score(peer, 'actual-review', new Date().toISOString(), 3, reviewed);
    const reviewedDue = due(reviewed);
    await expect(confirmSuperMemoDirectoryUpdate({ ...input, percent, preview: revised }, before.signature))
      .rejects.toThrow('supermemo_update_changed');
    expect(due(eligible)).toBe(original);
    const after = plan();
    expect(after.firstReviewChanges.map(change => change.status)).toEqual([percent ? 'update' : 'basis', 'protected', 'protected']);
    await confirmSuperMemoDirectoryUpdate({ ...input, percent, preview: revised }, after.signature);
    peer.reopen();
    bind();
    const updated = superMemoDueInstant(percent ? '2027-01-21' : '2027-01-01');
    expect(due(eligible)).toBe(updated);
    expect(due(manual)).toBe(manualDue);
    expect(due(reviewed)).toBe(reviewedDue);

    await syncWithAncestors(peer, replica, eligible);
    expect(replica.sqlite.prepare('SELECT due FROM node_review WHERE node_id = ?').pluck().get(eligible)).toBe(updated);
    expect(adjustSuperMemoImport(batchId, 100)).toMatchObject({ updated: 1, protectedItems: 2 });
    expect(due(eligible)).toBe(superMemoDueInstant('2027-02-10'));
  } finally {
    state.driver = null;
    await fixture.close();
  }
});
