// @vitest-environment node

import { expect, it } from 'vitest';

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

it('matches flattened table highlights by token windows when larger fragments fail', () => {
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
