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

it('matches table rows through punctuation-first fragment splitting', () => {
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
      'Weekly Review Keep the system current Open Someday/Waiting/Projects each week'
    )
  ).toBe('Weekly Review | Keep the system current | Open Someday/Waiting/Projects each week');
});

it('splits chinese highlights by punctuation and spaces when direct matching fails', () => {
  const content = [
    '# Notes',
    '',
    '我们 在这里 完成定位',
    '',
    '我们 在另外一处 结束'
  ].join('\n');

  expect(findContextExcerpt(content, '说明：我们 在这里 完成定位，附注')).toBeNull();
});

it('keeps english spaces as part of a fragment and splits on punctuation only', () => {
  const content = [
    '# Notes',
    '',
    'final target phrase keeps context',
    '',
    'another unrelated paragraph'
  ].join('\n');

  expect(findContextExcerpt(content, 'intro clause; final target phrase keeps context; trailing note')).toBeNull();
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
  ).toBeNull();
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

it('does not swallow the next numbered item when a highlight spans a heading and bullet lines', () => {
  const content = [
    '# Notes',
    '',
    '4. **习惯建立下一步**：完成后马上新建下一步或移动到 Waiting',
    '5. **每周回顾**：',
    '',
    '\t* 是否有项目已无任务？',
    '\t* 是否有任务长期未触发？',
    '6. **避免任务孤岛**：只要不是“一步事”，都建项目。'
  ].join('\n');

  expect(
    findContextExcerpt(
      content,
      ['**每周回顾**：', '• 是否有项目已无任务？', '• 是否有任务长期未触发？'].join('\n')
    )
  ).toBe(['每周回顾**：', '', '\t* 是否有项目已无任务？', '\t* 是否有任务长期未触发？'].join('\n'));
});

function createMultiParagraphQuoteContent() {
  return [
    '# Article',
    '',
    '##### ✅ 他的方法是 *可用的*，但并不 *可靠*',
    '',
    '他采取的做法是：',
    '',
    '>  * 每天浏览所有项目',
    '> * 手动挑选“今天想做的”，加上今日日期（无具体时间）',
    '> * 把「今日任务视图」当成下一步清单使用',
    '> ',
    '>  ',
    '',
    '这种方式看起来 **自由、灵活、简单**，但有几个问题：',
    '',
    '* ❌ **它靠“你每天会浏览项目”的前提**，这不是所有人做得到的。',
    '* ❌ **丢弃了上下文、优先级、依赖等关键结构**，导致系统对「现实复杂性」反应迟钝。',
    '* ❌ **全靠你脑子想下一步**，没有结构辅助判断。这种靠意志力和回忆力维持的系统，越复杂越容易崩。',
    '',
    '>  总结：他这是 **偏向“记事本式 GTD”的玩法**，对系统结构依赖极小，但对自律要求极高。'
  ].join('\n');
}

function expectLeadingMultiParagraphQuote(content: string) {
  expect(
    findContextExcerpt(
      content,
      [
        '的方法是 *可用的*，但并不 *可靠*',
        '他采取的做法是：',
        '',
        '> • 每天浏览所有项目',
        '>',
        '> • 手动挑选“今天想做的”，加上今日日期（无具体时间）',
        '>',
        '> • 把「今日任务视图」当成下一步清单使用',
        '>'
      ].join('\n')
    )
  ).toBe(
    [
      '的方法是 *可用的*，但并不 *可靠*',
      '',
      '他采取的做法是：',
      '',
      '>  * 每天浏览所有项目',
      '> * 手动挑选“今天想做的”，加上今日日期（无具体时间）',
      '> * 把「今日任务视图」当成下一步清单使用'
    ].join('\n')
  );
}

function expectTrailingMultiParagraphQuote(content: string) {
  expect(
    findContextExcerpt(
      content,
      [
        '这种方式看起来 **自由、灵活、简单**，但有几个问题：',
        '',
        '• ❌ **它靠“你每天会浏览项目”的前提**，这不是所有人做得到的。',
        '• ❌ **丢弃了上下文、优先级、依赖等关键结构**，导致系统对「现实复杂性」反应迟钝。',
        '• ❌ **全靠你脑子想下一步**，没有结构辅助判断。这种靠意志力和回忆力维持的系统，越复杂越容易崩。',
        '',
        '> 总结：他这是 **偏向“记事本式 GTD”的玩法**，对系统结构依赖极小，但对自律要求极高。'
      ].join('\n')
    )
  ).toBe(
    [
      '这种方式看起来 **自由、灵活、简单**，但有几个问题：',
      '',
      '* ❌ **它靠“你每天会浏览项目”的前提**，这不是所有人做得到的。',
      '* ❌ **丢弃了上下文、优先级、依赖等关键结构**，导致系统对「现实复杂性」反应迟钝。',
      '* ❌ **全靠你脑子想下一步**，没有结构辅助判断。这种靠意志力和回忆力维持的系统，越复杂越容易崩。',
      '',
      '>  总结：他这是 **偏向“记事本式 GTD”的玩法**，对系统结构依赖极小，但对自律要求极高。'
    ].join('\n')
  );
}

it('keeps the full multi-paragraph quote instead of collapsing to the middle paragraph', () => {
  const content = createMultiParagraphQuoteContent();
  expectLeadingMultiParagraphQuote(content);
  expectTrailingMultiParagraphQuote(content);
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
