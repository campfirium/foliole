import { expect, it } from 'vitest';

import { addSuperMemoSource, formatSuperMemoSource } from './superMemoSourceFormatting.js';

it('appends the chosen bibliography format and leaves out missing fields', () => {
  const formatted = formatSuperMemoSource({ title: 'Atomic Habits' }, 3302, { id: 'article', title: 'Atomic Habits' },
    { placement: 'body', template: 'From {articleLink}\nAuthor: {author}\nBook: {title}' });
  expect(addSuperMemoSource('Answer', formatted, 'body'))
    .toBe('Answer\n\nFrom [[node-id:article|Atomic Habits]]\nBook: Atomic Habits');
});
