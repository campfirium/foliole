import { expect, it } from 'vitest';

import { applyImportedHighlightAnchors } from '../../../lib/core/database/importHighlightAnchors.js';
import {
  classifyImportedBodyOccurrence,
  resolveImportedBodySearchFrom
} from '../../../lib/core/database/importHighlightBodyMatching.js';

function locate(content: string, text: string) {
  return applyImportedHighlightAnchors({
    content,
    highlights: [{ content: text, label: null }]
  }).highlights[0];
}

it.each([
  {
    content: ['---', 'author: Reader', '---', '', '# Imported title', '', '😀 Body target.'].join('\n'),
    name: 'LF input'
  },
  {
    content: ['---', 'author: Reader', '---', '', '# Imported title', '', '😀 Body target.'].join('\r\n'),
    name: 'CRLF input'
  },
  {
    content: ['# Imported title', '', '😀 Body target.'].join('\n'),
    name: 'input without frontmatter'
  }
])('returns UTF-16 body locators after the generated H1 for $name', ({ content }) => {
  const text = 'Body target.';
  const located = locate(content, text);

  expect(resolveImportedBodySearchFrom(content)).toBe(content.indexOf('😀'));
  expect(located).toMatchObject({ from: content.indexOf(text), locatorText: text, to: content.length });
  expect(content.slice(located?.from, located?.to)).toBe(text);
});

it('starts at the body when an imported document has frontmatter but no H1', () => {
  const content = ['---', 'author: Reader', '---', '', 'Body target.'].join('\n');
  const located = locate(content, 'Body target.');

  expect(resolveImportedBodySearchFrom(content)).toBeLessThanOrEqual(content.indexOf('Body target.'));
  expect(located?.from).toBe(content.indexOf('Body target.'));
});

it('keeps a title-only match unmapped', () => {
  const content = ['---', 'summary: Metadata target.', '---', '', '# Title target', '', 'Real body.'].join('\n');

  expect(locate(content, 'Metadata target.')).toBeUndefined();
  expect(locate(content, 'Title target')).toBeUndefined();
});

it('anchors title text only when it also has one unique real-body match', () => {
  const content = ['# Shared text', '', 'Intro with Shared text once.'].join('\n');
  const located = locate(content, 'Shared text');

  expect(located?.from).toBe(content.lastIndexOf('Shared text'));
  expect(content.slice(located?.from, located?.to)).toBe('Shared text');
});

it('fails closed when the real body contains multiple exact matches', () => {
  const content = ['# Imported title', '', 'Repeated text.', '', 'Repeated text.'].join('\n');

  expect(classifyImportedBodyOccurrence(content, 'Repeated text.')).toEqual({ range: null, status: 'ambiguous' });
  expect(locate(content, 'Repeated text.')).toBeUndefined();
});

it('fails closed when loose whitespace would match multiple body ranges', () => {
  const content = ['# Imported title', '', 'Repeated   text.', '', 'Repeated\ntext.'].join('\n');

  expect(locate(content, 'Repeated text.')).toBeUndefined();
});

it('still resolves one unique body match when no generated H1 is present', () => {
  const content = 'Lead paragraph.\n\nUnique target.';

  expect(locate(content, 'Unique target.')?.from).toBe(content.indexOf('Unique target.'));
});
