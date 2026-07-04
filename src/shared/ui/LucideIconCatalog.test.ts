import { expect, it } from 'vitest';

import { LUCIDE_ICON_OPTIONS } from './LucideIconCatalog';

function findIcon(id: string) {
  return LUCIDE_ICON_OPTIONS.find((icon) => icon.id === id);
}

it('includes Lucide-style keywords in icon search terms', () => {
  expect(findIcon('MessagesSquare')?.searchTerms).toEqual(
    expect.arrayContaining(['messages-square', 'discussion', 'discuss', 'speech bubbles'])
  );
});

it('includes generated name variants in icon search terms', () => {
  expect(findIcon('BookOpen')?.searchTerms).toEqual(expect.arrayContaining(['BookOpen', 'Book Open', 'book-open']));
});
