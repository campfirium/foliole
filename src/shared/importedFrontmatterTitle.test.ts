import { expect, it } from 'vitest';

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint';
import { normalizeImportedFrontmatterTitle } from '../../lib/core/import/frontmatterTitle';

it('promotes a top frontmatter title into the imported document heading and node title', () => {
  const prepared = createPreparedDesktopTextImport({
    content: [
      '---',
      'title: External Article',
      'author: Jane',
      'url: https://example.com/article',
      '---',
      '',
      'Opening paragraph.'
    ].join('\n'),
    fileName: 'saved-page.md',
    filePath: '/tmp/saved-page.md',
    importedAt: '2026-05-17T10:00:00.000Z',
    kind: 'markdown'
  });

  expect(prepared.nodeTitle).toBe('External Article');
  expect(prepared.hideTitleHeading).toBe(true);
  expect(prepared.content).toBe([
    '---',
    'author: Jane',
    'url: https://example.com/article',
    '---',
    '',
    '# External Article',
    '',
    'Opening paragraph.'
  ].join('\n'));
});

it('keeps existing matching title headings without duplicating them', () => {
  expect(normalizeImportedFrontmatterTitle([
    '---',
    'title: External Article',
    'author: Jane',
    '---',
    '',
    '# External Article',
    '',
    'Opening paragraph.'
  ].join('\n'))).toEqual({
    content: [
      '---',
      'author: Jane',
      '---',
      '',
      '# External Article',
      '',
      'Opening paragraph.'
    ].join('\n'),
    title: 'External Article'
  });
});

it('keeps the promoted frontmatter title as the only top-level heading', () => {
  const prepared = createPreparedDesktopTextImport({
    content: [
      '---',
      'title: External Article',
      'author: Jane',
      '---',
      '',
      '# Body Heading',
      '',
      'Opening paragraph.'
    ].join('\n'),
    fileName: 'saved-page.md',
    filePath: '/tmp/saved-page.md',
    importedAt: '2026-05-17T10:05:00.000Z',
    kind: 'markdown'
  });

  expect(prepared.nodeTitle).toBe('External Article');
  expect(prepared.hideTitleHeading).toBe(true);
  expect(prepared.content).toBe([
    '---',
    'author: Jane',
    '---',
    '',
    '# External Article',
    '',
    '## Body Heading',
    '',
    'Opening paragraph.'
  ].join('\n'));
});
