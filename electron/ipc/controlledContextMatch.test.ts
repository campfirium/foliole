// @vitest-environment node

import { expect, it } from 'vitest';

import { createContextExcerptQuoteLocator } from '../../lib/core/import/contextExcerptQuoteLocator.js';
import { findContextExcerpt } from '../../lib/core/import/controlledContextMatch.js';

it('matches list-heavy highlights by splitting on punctuation and bullets', () => {
  const content = [
    '# Notes',
    '',
    'Setup checklist:',
    '- alpha step',
    '- beta step',
    '- gamma step',
    '',
    'Another paragraph stays unrelated.'
  ].join('\n');

  expect(
    findContextExcerpt(
      content,
      ['Setup checklist:', '• alpha step', '• beta step'].join('\n')
    )
  ).toBe(['Setup checklist:', '- alpha step', '- beta step'].join('\n'));
});

it('matches flattened table highlights through punctuation-first fragment splitting', () => {
  const content = [
    '# Notes',
    '',
    '| Item | GTD Principle | Todoist Action |',
    '| --- | --- | --- |',
    '| Weekly Review | Keep the system current | Open Someday/Waiting/Projects each week |',
    '| Move to Today | Pull tasks into Today intentionally | Inbox -> Today or use Filter scan |'
  ].join('\n');

  expect(
    findContextExcerpt(
      content,
      'Item GTD Principle Todoist Action Weekly Review Keep the system current Open Someday/Waiting/Projects each week'
    )
  ).toBe(
    [
      '| Item | GTD Principle | Todoist Action |',
      '| --- | --- | --- |',
      '| Weekly Review | Keep the system current | Open Someday/Waiting/Projects each week |'
    ].join('\n')
  );
});

it('splits chinese highlights by punctuation and spaces when direct matching fails', () => {
  const content = [
    '# Notes',
    '',
    '我们 在这里 完成定位',
    '',
    '我们 在另外一处 结束'
  ].join('\n');

  expect(findContextExcerpt(content, '说明：我们 在这里 完成定位，附注')).toBe('我们 在这里 完成定位');
});

it('keeps english spaces as part of a fragment and splits on punctuation only', () => {
  const content = [
    '# Notes',
    '',
    'final target phrase keeps context',
    '',
    'another unrelated paragraph'
  ].join('\n');

  expect(findContextExcerpt(content, 'intro clause; final target phrase keeps context; trailing note')).toBe(
    'final target phrase keeps context'
  );
});

it('locks onto a nearby paragraph range when repeated fragments need a second clue', () => {
  const content = [
    '# Notes',
    '',
    'Status review:',
    '- repeated item',
    '',
    'Long gap paragraph',
    '- repeated item',
    '',
    'Long gap paragraph',
    '- repeated item',
    '',
    'Follow-up review:',
    '- repeated item',
    '',
    'Long gap paragraph',
    '- repeated item',
    '',
    'Status review:',
    '- repeated item',
    '',
    'Follow-up review:',
    '- repeated item'
  ].join('\n');

  expect(
    findContextExcerpt(
      content,
      ['Status review:', 'Follow-up review:'].join('\n')
    )
  ).toBe(['Status review:', '- repeated item', '', 'Follow-up review:'].join('\n'));
});

it('prefers the backward candidate closest to the anchor instead of an earlier duplicate token', () => {
  const content = [
    '# Notes',
    '',
    '我们 旧内容',
    '',
    '我们 在这里 完成定位',
    '',
    '结尾段落'
  ].join('\n');

  expect(
    findContextExcerpt(
      content,
      '我们 在这里 完成定位'
    )
  ).toBe('我们 在这里 完成定位');
});

it('trims a matched sentence down to the exact quote instead of keeping the full paragraph', () => {
  const content = [
    '# Article',
    '',
    'Before the quote. This is the highlighted sentence. After the quote.'
  ].join('\n');

  expect(findContextExcerpt(content, 'This is the highlighted sentence.')).toBe('This is the highlighted sentence.');
});

it('does not fall back to character-window reduction for space-less chinese quotes', () => {
  const content = [
    '# Notes',
    '',
    '前缀甲乙丙丁戊己庚辛壬目标后缀',
    '',
    '前缀甲乙丙丁戊己庚辛壬别的后缀'
  ].join('\n');

  expect(findContextExcerpt(content, '说明甲乙丙丁戊己庚辛壬目标')).toBeNull();
});

it('caps ordered fragment generation for very long quotes', () => {
  const longQuote = Array.from({ length: 600 }, (_, index) => `token-${index}`).join('。');
  const quoteLocator = createContextExcerptQuoteLocator(longQuote);
  expect(quoteLocator).not.toBeNull();
  expect(quoteLocator?.orderedFragments.length ?? 0).toBeLessThanOrEqual(128);
});
