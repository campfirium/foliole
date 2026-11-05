import { expect, it } from 'vitest';

import { collectDocumentOutlineNavigation } from './documentOutlineNavigation';
import { createOutlineFixture } from './documentOutlineNavigation.testSupport';

it('omits the article title while retaining its chapter hierarchy and source Highlights', () => {
  const content = '# Article title\n\nOpening passage\n\n## Chapter\n\nAlpha passage\n\n### Detail\n\nBeta passage';
  const fixture = createOutlineFixture(content);
  const model = collectDocumentOutlineNavigation({ ...fixture.article(), activeNodeId: 'node-1', snapshot: fixture.snapshot });
  expect(model.sections.map(section => [section.kind, section.text, section.level, section.entryIds])).toEqual([
    ['preface', '…', 1, ['preface']], ['heading', 'Chapter', 1, ['alpha']],
    ['heading', 'Detail', 2, ['item']], ['unplaced', '', 1, ['manual']]
  ]);
  expect(model.entries.alpha).toMatchObject({ text: 'Alpha passage', action: 'position' });
  expect(content.slice(model.entries.alpha!.selection!.from, model.entries.alpha!.selection!.to)).toBe('Alpha passage');
});

it('uses a flat list for a title-only article and keeps genuine first chapters without an article title', () => {
  const fixture = createOutlineFixture('---\nauthor: Example\n---\n# Article title\n\nAlpha passage');
  const model = collectDocumentOutlineNavigation({ ...fixture.article(), activeNodeId: 'node-1', snapshot: fixture.snapshot });
  expect(model.sections.map(section => section.kind)).toEqual(['body']);
  expect(model.sections[0]!.entryIds).toContain('alpha');
  const chapters = collectDocumentOutlineNavigation({ content: '## Chapter\n\n# Another chapter', activeNodeId: 'external', snapshot: null, textAnchorDecorations: [] });
  expect(chapters.sections.map(section => section.text)).toEqual(['Chapter', 'Another chapter']);
});

it('groups current-body ranges by heading, preserves preface and places unlocated cards last', () => {
  const fixture = createOutlineFixture();
  const model = collectDocumentOutlineNavigation({ ...fixture.article(), activeNodeId: 'node-1', snapshot: fixture.snapshot });
  expect(model.sections.map(section => [section.kind, section.text, section.entryIds])).toEqual([
    ['preface', '…', ['preface']], ['heading', 'Chapter', ['alpha']],
    ['heading', 'Detail', ['item']], ['unplaced', '', ['manual']]
  ]);
  expect(model.entries.alpha?.action).toBe('position');
  expect(model.entries.item?.action).toBe('card');
  expect(model.entries.item?.selection).toBeDefined();
  expect(model.entries.manual?.selection).toBeUndefined();
});

it('excludes deleted, unrelated and invalid source positions without discarding unlocated cards', () => {
  const fixture = createOutlineFixture();
  fixture.add('other', 'Alpha passage', 'topic', 'node-2');
  fixture.add('trashed', 'Beta passage').deletedAt = '2026-11-05T00:00:00Z';
  const missing = fixture.add('missing', 'Missing passage');
  missing.anchorLink = { id: 'missing', kind: 'highlight', locator: { from: 0, to: 9, originalText: 'Missing passage' } };
  const article = fixture.article();
  const model = collectDocumentOutlineNavigation({ ...article, activeNodeId: article.nodeId, snapshot: fixture.snapshot });
  expect(Object.keys(model.entries)).toEqual(expect.arrayContaining(['alpha', 'item', 'manual', 'missing']));
  expect(model.entries.other).toBeUndefined();
  expect(model.entries.trashed).toBeUndefined();
  expect(model.entries.missing?.action).toBe('card');
  expect(model.sections.at(-1)?.entryIds).toContain('missing');
});

it('assigns a multi-range object once at its earliest resolved source location', () => {
  const fixture = createOutlineFixture();
  const content = fixture.article().content;
  const range = (text: string) => ({ from: content.indexOf(text), to: content.indexOf(text) + text.length, originalText: text });
  fixture.snapshot.nodesById.alpha!.anchorLink!.locator = { ranges: [range('Beta passage'), range('Alpha passage')] };
  const model = collectDocumentOutlineNavigation({ ...fixture.article(), activeNodeId: 'node-1', snapshot: fixture.snapshot });
  expect(model.sections.filter(section => section.entryIds.includes('alpha'))).toHaveLength(1);
  expect(model.entries.alpha?.selection?.from).toBe(content.indexOf('Alpha passage'));
});

it('uses native source offsets with CRLF and recognizes all six heading levels', () => {
  const content = 'Introduction\r\n\r\n' + Array.from({ length: 6 }, (_, index) => '#'.repeat(index + 1) + ` Heading ${index + 1}`).join('\r\n');
  const model = collectDocumentOutlineNavigation({ content, activeNodeId: 'external', snapshot: null, textAnchorDecorations: [] });
  expect(model.sections.map(section => section.level)).toEqual([1, 2, 3, 4, 5, 6]);
  for (const section of model.sections) expect(content.slice(section.selection!.from, section.selection!.to)).toBe(section.text);
});

it('shows one flat root list without headings and an empty model without related content', () => {
  const fixture = createOutlineFixture('Opening passage Alpha passage Beta passage');
  const model = collectDocumentOutlineNavigation({ ...fixture.article(), activeNodeId: 'node-1', snapshot: fixture.snapshot });
  expect(model.sections.map(section => section.kind)).toEqual(['body']);
  expect(model.sections[0]?.entryIds.at(-1)).toBe('manual');
  expect(collectDocumentOutlineNavigation({ content: 'No headings', activeNodeId: 'external', snapshot: null, textAnchorDecorations: [] }).sections).toEqual([]);
});
