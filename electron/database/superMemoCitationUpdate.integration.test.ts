// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../lib/core/import/superMemoSchedulePreview.js';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { runSuperMemoImport } from '../import/runSuperMemoImport.js';
import { confirmSuperMemoDirectoryUpdate, updateSuperMemoDirectories } from '../import/updateSuperMemoDirectories.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection }));

const elements = [1, 2].map(id => ({
  id, parentId: null, children: [], sourceType: 'Item', title: `Card ${id}`, ordinal: null,
  bodyOrQuestionHtml: ['Original question'], answerHtml: ['Original answer'], skippedAudioComponents: 0, learning: null
} satisfies SuperMemoXmlDraftElement));
const scheduler = DEFAULT_REVIEW_SCHEDULER_SETTINGS;
const gradeMap = DEFAULT_SUPER_MEMO_GRADE_MAP;
const offset = '+00:00';
const rows = describeSuperMemoSource(elements, offset, scheduler, gradeMap).map(row => ({
  ...row, sourceBibliography: { title: 'Saved source title' }
}));
const preview = { referenceDay: '2026-11-16', rows };
const metadata = DEFAULT_SUPER_MEMO_SOURCE_FORMAT;
const footer = { placement: 'content-end', template: 'Title: {title}' } as const;
const input = { elements, preview, scheduler, gradeMap, offset, percent: 0, expectedImages: new Map<string, string | null>() };

it.each(['tracked', 'legacy'])('moves source information twice while respecting edited text in a %s batch', async format => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const bind = () => {
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  };
  const node = (title: string) => peer.sqlite.prepare('SELECT id, content, reveal FROM nodes WHERE title = ?').get(title) as
    { id: string; content: string; reveal: string };
  const plan = (sourceFormat: SuperMemoSourceFormat) =>
    updateSuperMemoDirectories(elements, preview, undefined, undefined, { ...input, sourceFormat })!;
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    bind();
    const batch = await runSuperMemoImport({ ...input, sourceFormat: metadata });
    if (format === 'legacy') peer.sqlite.prepare(`UPDATE workspace_meta SET value = (
      SELECT json_set(workspace_meta.value, '$.entries', json_group_array(json_remove(entry.value, '$.importedCitation')))
      FROM json_each(workspace_meta.value, '$.entries') AS entry
    ) WHERE key = ?`).run(`supermemo-import:${batch.batchId}`);
    const first = node('Card 1');
    const second = node('Card 2');
    const edited = first.reveal.replace('Original answer', 'My answer');
    const changedCitation = second.reveal.replace('Saved source title', 'My source title');
    applyParentContentChange({ driver: connection.driver!, nodeId: first.id, nextContent: 'My question', updatedAt: '2026-11-17' });
    peer.sqlite.prepare('UPDATE nodes SET reveal = ?, updated_at = ? WHERE id = ?').run(edited, '2026-11-17', first.id);
    peer.sqlite.prepare('UPDATE nodes SET reveal = ?, updated_at = ? WHERE id = ?').run(changedCitation, '2026-11-17', second.id);
    const forward = plan(footer);
    expect(forward.citationChanges).toMatchObject([{ sourceId: 1, status: 'update' }, { sourceId: 2, status: 'protected' }]);
    expect(node('Card 1').reveal).toBe(edited);
    await confirmSuperMemoDirectoryUpdate({ ...input, sourceFormat: footer }, forward.signature);
    peer.reopen();
    bind();
    expect(node('Card 1')).toEqual({ ...first, content: 'My question\n\nTitle: Saved source title', reveal: 'My answer' });
    expect(node('Card 2')).toEqual({ ...second, reveal: changedCitation });
    const backward = plan(metadata);
    expect(backward.citationChanges).toMatchObject([{ sourceId: 1, status: 'update' }]);
    await confirmSuperMemoDirectoryUpdate({ ...input, sourceFormat: metadata }, backward.signature);
    expect(node('Card 1')).toEqual({ ...first, content: 'My question', reveal: edited });
    expect(node('Card 2')).toEqual({ ...second, reveal: changedCitation });
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});

it('stores shared sources once, appends only differences, and imports clean titles with working anchors', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const references = (title: string, author: string) => '<hr SuperMemo><SuperMemoReference>'
    + `#Title: ${title}<br>#Author: ${author}<br>#Source: Example</SuperMemoReference>`;
  const article = references('Original title', 'Jane Doe');
  const exportTitle = '<span class="headers">Title:</span><span class="RefText"> Own title</span>';
  const makeTopic = (id: number, body: string, title: string | null, children: number[] = []) => ({
    ...elements[0]!, id, parentId: null, sourceType: 'Topic', title, children, bodyOrQuestionHtml: [body], answerHtml: []
  });
  const selected = [
    makeTopic(10, '<p>One card original answer.</p><p>Other question.</p>' + article, null, [1, 2, 14]),
    { ...makeTopic(14, '<p>Other question.</p>' + article, null), parentId: 10 },
    { ...elements[0]!, parentId: 10, bodyOrQuestionHtml: ['<p>One card <span class="cloze">[...]</span>.</p>' + article], answerHtml: ['original answer'] },
    { ...elements[1]!, parentId: 10, bodyOrQuestionHtml: ['<p>Other question.</p>' + references('Original title', 'John Doe')] },
    makeTopic(11, exportTitle + '<p>Body</p>' + references('Own title', 'Jane Doe'), 'Own title'),
    makeTopic(12, '<h1>' + exportTitle + '</h1><p>Body</p>' + references('Own title', 'Jane Doe'), null),
    makeTopic(13, '<h1>Clean HTML title</h1><p>Body</p>', null)
  ];
  const selectedRows = describeSuperMemoSource(selected, offset, scheduler, gradeMap).map(row =>
    row.parentId ? { ...row, sourceArticleId: 10 } : { ...row, sourceArticleId: null });
  const sourceFormat = { ...metadata, referenceMap: { Author: 'byline', Source: '' } };
  const migration = { ...input, sourceFormat, elements: selected, preview: { ...preview, rows: selectedRows } };
  type Written = { id: string; title: string; content: string; reveal: string | null; anchor_link: string | null };
  const node = (title: string) => peer.sqlite.prepare('SELECT id, title, content, reveal, anchor_link FROM nodes WHERE title = ?')
    .get(title) as Written;
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    const bind = () => {
      connection.driver = createBetterSqlite3Driver(peer.sqlite);
      bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    };
    bind();
    await runSuperMemoImport(migration);
    peer.reopen();
    bind();
    expect(node('Original title').content).toBe('---\nTitle: "Original title"\nbyline: "Jane Doe"\n---\n\n'
      + '# Original title\n\nOne card original answer.\n\nOther question.');
    expect(node('Card 1')).toMatchObject({ content: 'One card [...].', reveal: 'original answer' });
    const { locator } = JSON.parse(node('Card 1').anchor_link!);
    expect(node('Original title').content.slice(locator.from, locator.to)).toBe('original answer');
    expect(node('Other question.').content).toBe('Other question.');
    expect(node('Card 2')).toMatchObject({ content: 'Other question.\n\nbyline: John Doe', reveal: 'Original answer' });
    const rawCards = [node('Card 1'), node('Card 2')];
    const cleanHeading = peer.sqlite.prepare("SELECT content FROM nodes WHERE title = 'Own title' ORDER BY id").pluck().all();
    expect(cleanHeading).toEqual(Array(2).fill('---\nTitle: "Own title"\nbyline: "Jane Doe"\n---\n\n# Own title\n\nBody'));
    expect(node('Clean HTML title').content).toBe('# Clean HTML title\n\nBody');
    const plan = updateSuperMemoDirectories(selected, migration.preview, undefined, undefined, migration)!;
    expect(plan.citationChanges).toEqual([]);
    expect(plan.textChanges).toEqual([]);
    await confirmSuperMemoDirectoryUpdate(migration, plan.signature);
    expect([node('Card 1'), node('Card 2')]).toEqual(rawCards);
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});

it('updates generated titles and legacy sources in place while protecting renamed Topics', async () => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  const source = '<SuperMemoReference>#Title: Article</SuperMemoReference>';
  const selection = [10, 11].map(id => ({
    ...elements[0]!, id, sourceType: 'Topic', title: null, answerHtml: [],
    bodyOrQuestionHtml: ['<p>My document.</p>' + source]
  }));
  const sourceRows = describeSuperMemoSource(selection, offset, scheduler, gradeMap);
  const legacyPreview = { ...preview, rows: sourceRows.map(row => ({ ...row, title: 'Title: Article' })) };
  const next = { ...input, elements: selection, preview: { ...preview, rows: sourceRows }, sourceFormat: { ...metadata, referenceMap: {} } };
  const bind = () => {
    connection.driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: peer.id, libraryPath: peer.file });
  };
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(peer.id), new Date().toISOString());
    bind();
    const batch = await runSuperMemoImport({ ...next, preview: legacyPreview, sourceFormat: metadata });
    const ids = peer.sqlite.prepare(`SELECT json_extract(entry.value, '$.nodeId') FROM workspace_meta,
      json_each(workspace_meta.value, '$.entries') AS entry WHERE workspace_meta.key = ? ORDER BY json_extract(entry.value,'$.id')`)
      .pluck().all(`supermemo-import:${batch.batchId}`) as string[];
    const read = (id: string) => peer.sqlite.prepare('SELECT id, title, content FROM nodes WHERE id = ?').get(id);
    peer.sqlite.prepare('UPDATE nodes SET title = ? WHERE id = ?').run('My title', ids[1]);
    const plan = updateSuperMemoDirectories(selection, next.preview, undefined, undefined, next)!;
    expect(plan).toMatchObject({ hasRuleCorrections: true });
    expect(plan.textChanges.map(change => change.field)).toEqual(['body', 'body']);
    const before = read(ids[0]!);
    expect(before).toMatchObject({ title: 'Title: Article' });
    await confirmSuperMemoDirectoryUpdate(next, plan.signature, [], true);
    expect(read(ids[0]!)).toEqual({ ...before as object, title: 'Article' });
    expect(read(ids[1]!)).toMatchObject({ title: 'My title' });
    const remaining = updateSuperMemoDirectories(selection, next.preview, undefined, undefined, next)!;
    expect(remaining.hasRuleCorrections).toBeUndefined();
    await confirmSuperMemoDirectoryUpdate(next, remaining.signature);
    peer.reopen();
    bind();
    expect(read(ids[0]!)).toEqual({ id: ids[0], title: 'Article', content: '---\nTitle: "Article"\n---\n\n# Article\n\nMy document.' });
    expect(read(ids[1]!)).toMatchObject({ id: ids[1], title: 'My title' });
    expect(updateSuperMemoDirectories(selection, next.preview, undefined, undefined, next)?.textChanges)
      .toEqual([]);
    peer.sqlite.prepare('UPDATE nodes SET title = ? WHERE id = ?').run('My later title', ids[0]);
    expect(updateSuperMemoDirectories(selection, next.preview, undefined, undefined, next)?.textChanges)
      .toEqual([]);
  } finally {
    connection.driver = null;
    await fixture.close();
  }
});
