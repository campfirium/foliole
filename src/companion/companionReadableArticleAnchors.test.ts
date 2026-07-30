import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

it('keeps Topic isolation separate from Topic and Review highlight compatibility', () => {
  const css = readFileSync(join(process.cwd(), 'src/companion/companionReadableArticleAnchors.css'), 'utf8');

  expect(css).toContain("[data-companion-readable-document='true'] {");
  expect(css).toContain('contain: paint');
  expect(css).toContain('isolation: isolate');
  expect(css).toContain('position: relative');
  expect(css).toContain('z-index: var(--z-local-base)');
  expect(css).toContain("[data-companion-article-document='true'] :is(.cm-md-highlight");
  expect(css).toContain("[data-companion-article-document='true'] .cm-md-cloze");
});
