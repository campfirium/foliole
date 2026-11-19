import { expect, it } from 'vitest';

import { addSuperMemoSource, formatSuperMemoSource } from './superMemoSourceFormatting.js';

it('appends the chosen bibliography format and leaves out missing fields', () => {
  const formatted = formatSuperMemoSource({ title: 'Atomic Habits' }, 3302, { id: 'article', title: 'Atomic Habits' },
    { placement: 'body', template: 'From {articleLink}\nAuthor: {author}\nBook: {title}' });
  expect(addSuperMemoSource('Answer', formatted, 'body'))
    .toBe('Answer\n\nFrom [[node-id:article|Atomic Habits]]\nBook: Atomic Habits');
});

it('writes original reference values with same-name defaults, renamed fields, and explicit omissions', () => {
  const formatted = formatSuperMemoSource({
    title: 'Original title', author: 'Jane Doe', url: 'https://example.com/?q=one#anchor',
    date: '06.05.2026', publisher: 'Example'
  }, 192, { id: 'parent', title: 'Source article' }, {
    placement: 'metadata', template: '', referenceMap: { Author: 'byline', Source: '' }
  });
  expect(formatted).toBe([
    'Title: "Original title"', 'byline: "Jane Doe"', 'Link: "https://example.com/?q=one#anchor"',
    'Date: "06.05.2026"', 'Article: "192"'
  ].join('\n'));
});
