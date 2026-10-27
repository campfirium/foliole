import { afterEach, expect, it, vi } from 'vitest';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import { collectPreviewLineDecorationPlan } from './liveMarkdownLinePlans';
import { collectMarkdownInlineRanges } from './markdownInlineProjection';
import { collectMarkdownEmbedRanges, collectMarkdownWikiLinkRanges } from './markdownOblikeInlineProjection';

afterEach(() => vi.restoreAllMocks());

it('parses one reading paragraph once across its inline display projections', () => {
  const text = `Reading paragraph work contract ${Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')}`;
  const parse = vi.spyOn(folioleMarkdownParser, 'parse');
  const plan = collectPreviewLineDecorationPlan({ hideTitleHeading: false, inCodeBlock: false,
    isCursorLine: false, lineFrom: 0, lineNumber: 1, lineText: text, markdownSyntaxVisible: false });
  expect(plan.imageMatches).toEqual([]);
  expect(plan.footnoteMatches).toEqual([]);
  expect(plan.textDecorationPlans.every(value => !value.markRanges.length && !value.replaceRanges.length)).toBe(true);
  expect(parse.mock.calls.filter(([input]) => input === text)).toHaveLength(1);
});

it('keeps offsets, syntax facts and independent result arrays correct when sharing a source tree', () => {
  const text = '**Strong** and [[Page]] with ![[Folder/Card|Alias]]';
  const first = collectMarkdownInlineRanges(text, 0);
  expect(first).toContainEqual(expect.objectContaining({ kind: 'strong', text: 'Strong', from: 0 }));
  expect(collectMarkdownWikiLinkRanges(text, 10)).toContainEqual(expect.objectContaining({ title: 'Page', from: 25 }));
  expect(collectMarkdownEmbedRanges(text)).toContainEqual(expect.objectContaining({ target: 'Folder/Card' }));
  expect(collectMarkdownInlineRanges(text, 100)).toContainEqual(expect.objectContaining({ kind: 'strong', from: 100 }));
  first[0]!.syntaxRanges[0]!.from = 999;
  expect(collectMarkdownInlineRanges(text)[0]!.syntaxRanges[0]!.from).toBe(0);
  expect(collectMarkdownInlineRanges('A changed paragraph')).toEqual([]);
  expect(collectMarkdownInlineRanges(text)[0]!.text).toBe('Strong');
});

it('does not retain source trees across independent requests', () => {
  const parse = vi.spyOn(folioleMarkdownParser, 'parse');
  const large = `Oversized projection ${'x'.repeat(70 * 1024)}`;
  expect(collectMarkdownInlineRanges(large)).toEqual([]);
  expect(collectMarkdownInlineRanges(large)).toEqual([]);
  expect(parse.mock.calls.filter(([input]) => input === large)).toHaveLength(2);
  const text = 'An earlier projection paragraph';
  collectMarkdownInlineRanges(text);
  collectMarkdownInlineRanges('A replacement projection paragraph');
  collectMarkdownInlineRanges(text);
  expect(parse.mock.calls.filter(([input]) => input === text)).toHaveLength(2);
});


it('releases the shared source tree when reading display planning finishes', () => {
  const text = 'The completed reading display projection';
  const parse = vi.spyOn(folioleMarkdownParser, 'parse');
  collectPreviewLineDecorationPlan({ hideTitleHeading: false, inCodeBlock: false,
    isCursorLine: false, lineFrom: 0, lineNumber: 1, lineText: text, markdownSyntaxVisible: false });
  collectMarkdownInlineRanges(text);
  expect(parse.mock.calls.filter(([input]) => input === text)).toHaveLength(2);
});
