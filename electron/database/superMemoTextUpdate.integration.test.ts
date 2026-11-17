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
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { syncWithAncestors } from './superMemoLearningJourney.testSupport.js';

const state = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null, rule: 1 }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => state }));
vi.mock('../../lib/core/import/superMemoContent.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/core/import/superMemoContent.js')>();
  return { ...actual, convertSuperMemoContent: (...args: Parameters<typeof actual.convertSuperMemoContent>) => {
    const value = actual.convertSuperMemoContent(...args);
    return { ...value, content: value.content.replaceAll('Rule marker', `Rule ${state.rule}`) };
  } };
});

const element: SuperMemoXmlDraftElement = {
  id: 1, parentId: null, children: [], sourceType: 'Item', title: 'Source card', ordinal: null,
  bodyOrQuestionHtml: ['Rule marker question'], answerHtml: ['Rule marker answer'], skippedAudioComponents: 0, learning: null
};
const elements: SuperMemoXmlDraftElement[] = [element,
  { ...element, id: 2, sourceType: 'Topic', title: 'Unedited source topic', bodyOrQuestionHtml: ['Rule marker body'], answerHtml: [] }];
const input = { elements, offset: '+00:00', percent: 0, scheduler: DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  gradeMap: DEFAULT_SUPER_MEMO_GRADE_MAP, sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT, expectedImages: new Map<string, string | null>() };
const preview = () => ({ referenceDay: '2026-11-16', rows: describeSuperMemoSource(elements, input.offset, input.scheduler, input.gradeMap) });

it('updates the answer and Topic body across rule changes while keeping a manually edited question', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const replica = fixture.peer('target');
  const bind = () => {
    state.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(state.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  };
  const read = (title: string) => peer.sqlite.prepare('SELECT id, content, reveal FROM nodes WHERE title = ?')
    .get(title) as { id: string; content: string; reveal: string | null };
  const plan = () => updateSuperMemoDirectories(elements, preview(), undefined, undefined, input)!;
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    bind();
    await runSuperMemoImport({ ...input, preview: preview() });
    const before = read('Source card');
    const publish = async () => {
      await syncWithAncestors(peer, replica, before.id);
    };
    await publish();
    applyParentContentChange({ driver: state.driver!, nodeId: before.id, nextContent: 'My question', updatedAt: '2026-11-17' });
    expect(plan().textChanges).toEqual([]);
    for (const rule of [2, 3]) {
      state.rule = rule;
      const result = plan();
      expect(result.textChanges).toMatchObject([
        { sourceId: 1, field: 'question', status: 'protected', reason: 'edited' },
        { sourceId: 1, field: 'answer', status: 'update' },
        { sourceId: 2, field: 'body', status: 'update' }
      ]);
      expect(read('Source card')).toEqual({ ...before, content: 'My question', reveal: `Rule ${rule - 1} answer` });
      await confirmSuperMemoDirectoryUpdate({ ...input, preview: preview() }, result.signature);
      peer.reopen();
      bind();
      expect(read('Source card')).toEqual({ ...before, content: 'My question', reveal: `Rule ${rule} answer` });
      expect(read('Unedited source topic').content).toBe(`Rule ${rule} body`);
      await publish();
      expect(replica.sqlite.prepare('SELECT content, reveal FROM nodes WHERE id = ?').get(before.id))
        .toEqual({ content: 'My question', reveal: `Rule ${rule} answer` });
    }
  } finally {
    state.driver = null;
    state.rule = 1;
    await fixture.close();
  }
});
