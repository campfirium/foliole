// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  normalizeExportBook,
  normalizeReaderDocument,
  resolveReaderBodyAncestor,
  stableShape,
  summarizeReaderBody
} from './readwiseApiContract.js';

describe('Readwise API contract normalization', () => {
  it('resolves highlights and notes through a typed parent chain', () => {
    const documents = [
      { category: 'article', html_content: '<p>Readable body</p>', id: 'doc', parent_id: null },
      { category: 'highlight', id: 'highlight', parent_id: 'doc' },
      { category: 'note', id: 'note', parent_id: 'highlight' }
    ].map(normalizeReaderDocument).filter((item) => item !== null);
    const byId = new Map(documents.map((item) => [item.id, item]));

    expect(resolveReaderBodyAncestor('highlight', byId)).toEqual({ documentId: 'doc', reason: 'resolved' });
    expect(resolveReaderBodyAncestor('note', byId)).toEqual({ documentId: 'doc', reason: 'resolved' });
  });

  it('fails closed for missing parents and cycles', () => {
    const missing = normalizeReaderDocument({ category: 'highlight', id: 'highlight', parent_id: 'absent' })!;
    expect(resolveReaderBodyAncestor('highlight', new Map([[missing.id, missing]]))).toEqual({
      documentId: null,
      reason: 'missing_parent'
    });
    const left = normalizeReaderDocument({ category: 'note', id: 'left', parent_id: 'right' })!;
    const right = normalizeReaderDocument({ category: 'highlight', id: 'right', parent_id: 'left' })!;
    expect(resolveReaderBodyAncestor('left', new Map([[left.id, left], [right.id, right]]))).toEqual({
      documentId: null,
      reason: 'cycle'
    });
  });

  it('keeps only stable export identities and distributable URL shapes', () => {
    expect(normalizeExportBook({
      external_id: 'reader-doc',
      highlights: [{ external_id: 'reader-highlight' }, { external_id: null }],
      is_deleted: true,
      source: 'reader'
    })).toEqual({
      category: null,
      externalId: 'reader-doc',
      highlightExternalIds: ['reader-highlight'],
      highlights: [{
        externalId: 'reader-highlight', isDeleted: false, note: null, text: null, updatedAt: null
      }],
      isDeleted: true,
      source: 'reader'
    });
    expect(normalizeReaderDocument({ id: 'doc', raw_source_url: 'file:///private/book.epub' })?.rawSourceUrl).toBeNull();
    expect(normalizeReaderDocument({ id: 'doc', image_url: 'https://cdn.example.com/cover.jpg' })?.imageUrl)
      .toBe('https://cdn.example.com/cover.jpg');
    expect(normalizeReaderDocument({ id: 'doc', image_url: 'file:///private/cover.jpg' })?.imageUrl).toBeNull();
  });

  it('summarizes readable HTML without retaining its content', () => {
    const document = normalizeReaderDocument({ category: 'rss', html_content: '<p>Private text</p>', id: 'doc' })!;
    const summary = summarizeReaderBody(document);
    expect(summary).toMatchObject({ category: 'rss', htmlPresent: true, readable: true, warnings: [] });
    expect(summary.markdownHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(summary)).not.toContain('Private text');
  });

  it('reduces response fixtures to field types', () => {
    expect(stableShape({ results: [{ id: 'secret', parent_id: null }], token: 'secret' })).toEqual({
      results: [{ id: 'string', parent_id: 'object' }],
      token: 'string'
    });
  });
});
