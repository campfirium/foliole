import { expect, it } from 'vitest';

import type { FoliolePublishCard } from './foliolePublishModel.js';
import {
  cardsForTerm,
  groupCardsByUpdatedYear,
  projectPublishedCards,
  publicTermSlug,
  searchIndexScript,
  taxonomyIndex
} from './foliolePublishSiteProjection.js';

function card(id: string, updatedAt: string, publishedAt = updatedAt): FoliolePublishCard {
  return { file: `Content/${id}.md`, id, published_at: publishedAt, title: id, updated_at: updatedAt };
}

it('keeps equal update timestamps stable and projects a complete first content block', () => {
  const projected = projectPublishedCards([
    { card: card('first', '2026-07-23T00:00:00.000Z'), fields: [], markdown: '# Heading\n\nFirst paragraph.\n\nSecond paragraph.' },
    { card: card('second', '2026-07-23T00:00:00.000Z'), fields: [], markdown: 'Only paragraph.' }
  ]);

  expect(projected.map((item) => item.id)).toEqual(['first', 'second']);
  expect(projected[0]).toMatchObject({ has_more: true, preview: '<p>First paragraph.</p>' });
  expect(projected[0]?.content).toContain('<h2>Heading</h2>');
  expect(projected[0]?.content).not.toContain('<h1>');
});

it('removes a leading Markdown heading that duplicates the public Topic title', () => {
  const [projected] = projectPublishedCards([{
    card: { ...card('topic', '2026-07-23T00:00:00.000Z'), title: 'Public title' },
    fields: [], markdown: '# Public title\n\nFirst public segment.'
  }]);

  expect(projected?.content).toBe('<p>First public segment.</p>');
  expect(projected?.preview).toBe('<p>First public segment.</p>');
});

it('skips headings, rules, and pure images before selecting the first preview block', () => {
  const [projected] = projectPublishedCards([{
    card: card('visual', '2026-07-23T00:00:00.000Z'), fields: [],
    markdown: '# Heading\n\n---\n\n![remote](https://example.com/image.png)\n\n> Complete quote.'
  }]);

  expect(projected?.preview).toBe('<blockquote><p>Complete quote.</p></blockquote>');
  expect(projected?.has_more).toBe(false);
});

it('normalizes taxonomy values, avoids slug collisions, and groups by update year', () => {
  const projected = projectPublishedCards([{
    card: card('topic', '2026-07-23T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
    fields: [
      { key: 'Category', value: [' Writing ', 'writing', '研究/写作'] },
      { key: 'tags', value: ['Foliole', 'foliole'] }
    ],
    markdown: 'Body.'
  }]);

  expect(projected[0]?.categories.map((term) => term.name)).toEqual(['Writing', '研究/写作']);
  expect(projected[0]?.tags.map((term) => term.name)).toEqual(['Foliole']);
  expect(publicTermSlug('A/B')).not.toBe(publicTermSlug('A B'));
  expect(groupCardsByUpdatedYear(projected).map((group) => group.label)).toEqual(['2026']);
  const category = taxonomyIndex(projected, 'categories')[0];
  expect(category?.count).toBe(1);
  expect(cardsForTerm(projected, 'categories', category?.slug ?? '')).toHaveLength(1);
});

it('serializes public search text without closing the script context', () => {
  const projected = projectPublishedCards([{
    card: { ...card('unsafe', '2026-07-23T00:00:00.000Z'), title: '</script> "quoted"' },
    fields: [{ key: 'tags', value: ['中文', '"quoted"'] }],
    markdown: 'Line one.\n\n</script>\nNext line.'
  }]);
  const script = searchIndexScript(projected);

  expect(script).not.toContain('</script>');
  expect(script).toContain('\\u003c/script>');
  expect(script).toContain('中文');
  expect(script).toContain('\\"quoted\\"');
});
