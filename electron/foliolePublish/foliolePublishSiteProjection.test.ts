import { expect, it } from 'vitest';

import type { FoliolePublishTopic } from './foliolePublishModel.js';
import {
  groupTopicsByUpdatedYear,
  projectPublishedTopics,
  publicTermSlug,
  searchIndexScript,
  taxonomyIndex,
  topicsForTerm
} from './foliolePublishSiteProjection.js';

function topic(number: number, updatedAt: string, publishedAt = updatedAt): FoliolePublishTopic {
  return { file: `Content/${number}.md`, number, published_at: publishedAt, source_key: `source-${number}`, title: `Topic ${number}`, updated_at: updatedAt };
}

it('keeps equal update timestamps stable and projects a complete first content block', () => {
  const projected = projectPublishedTopics([
    { fields: [], markdown: '# Heading\n\nFirst paragraph.\n\nSecond paragraph.', topic: topic(1, '2026-07-23T00:00:00.000Z') },
    { fields: [], markdown: 'Only paragraph.', topic: topic(2, '2026-07-23T00:00:00.000Z') }
  ]);

  expect(projected.map((item) => item.id)).toEqual(['1', '2']);
  expect(projected[0]?.path).toBe('topics/1/');
  expect(projected[0]).toMatchObject({ has_more: true, preview: '<p>First paragraph.</p>' });
  expect(projected[0]?.content).toContain('<h2>Heading</h2>');
  expect(projected[0]?.content).not.toContain('<h1>');
});

it('removes a leading Markdown heading that duplicates the public Topic title', () => {
  const [projected] = projectPublishedTopics([{
    fields: [], markdown: '# Public title\n\nFirst public segment.',
    topic: { ...topic(1, '2026-07-23T00:00:00.000Z'), title: 'Public title' }
  }]);

  expect(projected?.content).toBe('<p>First public segment.</p>');
  expect(projected?.preview).toBe('<p>First public segment.</p>');
});

it('skips headings, rules, and pure images before selecting the first preview block', () => {
  const [projected] = projectPublishedTopics([{
    fields: [], markdown: '# Heading\n\n---\n\n![remote](https://example.com/image.png)\n\n> Complete quote.',
    topic: topic(1, '2026-07-23T00:00:00.000Z')
  }]);

  expect(projected?.preview).toBe('<blockquote><p>Complete quote.</p></blockquote>');
  expect(projected?.has_more).toBe(false);
});

it('normalizes taxonomy values, avoids slug collisions, and groups by update year', () => {
  const projected = projectPublishedTopics([{
    fields: [
      { key: 'Category', value: [' Writing ', 'writing', '研究/写作'] },
      { key: 'tags', value: ['Foliole', 'foliole'] }
    ],
    markdown: 'Body.', topic: topic(1, '2026-07-23T00:00:00.000Z', '2025-01-01T00:00:00.000Z')
  }]);

  expect(projected[0]?.categories.map((term) => term.name)).toEqual(['Writing', '研究/写作']);
  expect(projected[0]?.tags.map((term) => term.name)).toEqual(['Foliole']);
  expect(publicTermSlug('A/B')).not.toBe(publicTermSlug('A B'));
  expect(groupTopicsByUpdatedYear(projected).map((group) => group.label)).toEqual(['2026']);
  const category = taxonomyIndex(projected, 'categories')[0];
  expect(category?.count).toBe(1);
  expect(topicsForTerm(projected, 'categories', category?.slug ?? '')).toHaveLength(1);
});

it('serializes public search text without closing the script context', () => {
  const projected = projectPublishedTopics([{
    fields: [{ key: 'tags', value: ['中文', '"quoted"'] }],
    markdown: 'Line one.\n\n</script>\nNext line.',
    topic: { ...topic(1, '2026-07-23T00:00:00.000Z'), title: '</script> "quoted"' }
  }]);
  const script = searchIndexScript(projected);

  expect(script).not.toContain('</script>');
  expect(script).toContain('\\u003c/script>');
  expect(script).toContain('中文');
  expect(script).toContain('\\"quoted\\"');
});
