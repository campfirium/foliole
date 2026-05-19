import { describe, expect, it } from 'vitest';

import { collectMarkdownInlineLinkRanges } from './markdownInlineLinkProjection';
import { collectMarkdownInlineRanges } from './markdownInlineProjection';

const LONG_ZHIHU_LINK_STRONG = '**《[Chrome插件《Anki 划词制卡助手》使用说明(含视频教程)](https://link.zhihu.com/?target=https%3A//ninja33.github.io/20160817/anki-dict-helper-chrome-extension/)》**。';

describe('markdownInlineProjection punctuation emphasis compatibility', () => {
  it('projects punctuation-wrapped emphasis next to CJK text', () => {
    expect(collectMarkdownInlineRanges('过时的*（垃圾）*。')).toEqual([
      {
        contentFrom: 4,
        contentTo: 8,
        from: 3,
        kind: 'emphasis',
        syntaxRanges: [
          { from: 3, to: 4 },
          { from: 8, to: 9 }
        ],
        text: '（垃圾）',
        to: 9
      }
    ]);
  });
});

describe('markdownInlineProjection Markdown Compatibility', () => {
  it('projects lenient strong emphasis as strong text without changing source content', () => {
    expect(collectMarkdownInlineRanges('**实操含义：**如果你的应用场景')).toEqual([
      {
        contentFrom: 2,
        contentTo: 7,
        from: 0,
        kind: 'strong',
        syntaxRanges: [
          { from: 0, to: 2 },
          { from: 7, to: 9 }
        ],
        text: '实操含义：',
        to: 9
      }
    ]);
  });

  it('supports ASCII punctuation before adjacent text', () => {
    expect(collectMarkdownInlineRanges('**ab:**123123')).toEqual([
      {
        contentFrom: 2,
        contentTo: 5,
        from: 0,
        kind: 'strong',
        syntaxRanges: [
          { from: 0, to: 2 },
          { from: 5, to: 7 }
        ],
        text: 'ab:',
        to: 7
      }
    ]);
  });

  it('keeps standard adjacent strong emphasis on the standard projection path', () => {
    expect(collectMarkdownInlineRanges('**123**dsafdasdfasdf')).toEqual([
      {
        contentFrom: 2,
        contentTo: 5,
        from: 0,
        kind: 'strong',
        syntaxRanges: [
          { from: 0, to: 2 },
          { from: 5, to: 7 }
        ],
        text: '123',
        to: 7
      }
    ]);
  });

});

describe('markdownInlineProjection spaced strong links', () => {
  it('projects long imported punctuation-wrapped links as strong text', () => {
    const text = `详见${LONG_ZHIHU_LINK_STRONG}`;
    const closeFrom = text.lastIndexOf('**');

    expect(collectMarkdownInlineRanges(text)[0]).toMatchObject({
      contentFrom: 4,
      contentTo: closeFrom,
      from: 2,
      kind: 'strong',
      syntaxRanges: [
        { from: 2, to: 4 },
        { from: closeFrom, to: closeFrom + 2 }
      ],
      to: closeFrom + 2
    });
  });

  it('projects spaced strong emphasis around punctuation-wrapped links', () => {
    expect(collectMarkdownInlineRanges('详见** 《[A](https://e.test)》 **。')).toEqual([
      {
        contentFrom: 4,
        contentTo: 27,
        from: 2,
        kind: 'strong',
        syntaxRanges: [
          { from: 2, to: 4 },
          { from: 27, to: 29 }
        ],
        text: ' 《[A](https://e.test)》 ',
        to: 29
      }
    ]);
  });

  it('keeps inner links projectable when spaced strong markers are hidden', () => {
    const [linkRange] = collectMarkdownInlineLinkRanges('详见** 《[A](https://e.test)》 **。');

    expect(linkRange).toMatchObject({
      href: 'https://e.test',
      labelFrom: 7,
      labelText: 'A',
      labelTo: 8,
      safe: true
    });
  });
});

describe('markdownInlineProjection trailing-space strong compatibility', () => {
  it('projects line-ending strong emphasis with whitespace around the closing mark', () => {
    expect(collectMarkdownInlineRanges('**小火箭方法。 **   ')).toEqual([
      {
        contentFrom: 2,
        contentTo: 9,
        from: 0,
        kind: 'strong',
        syntaxRanges: [
          { from: 0, to: 2 },
          { from: 9, to: 11 }
        ],
        text: '小火箭方法。 ',
        to: 11
      }
    ]);
  });
});

describe('markdownInlineProjection nested Markdown Compatibility', () => {
  it('projects lenient strong emphasis around inline links with valid syntax ranges', () => {
    expect(collectMarkdownInlineRanges('**[标日高级班](https://class.hujiang.com/course/30789?source=16483)**这一段')).toEqual([
      {
        contentFrom: 2,
        contentTo: 62,
        from: 0,
        kind: 'strong',
        syntaxRanges: [
          { from: 0, to: 2 },
          { from: 62, to: 64 }
        ],
        text: '[标日高级班](https://class.hujiang.com/course/30789?source=16483)',
        to: 64
      }
    ]);
  });

  it('projects triple-star strong emphasis as nested emphasis and strong ranges', () => {
    expect(collectMarkdownInlineRanges('***小火箭方法。 ***')).toEqual([
      {
        contentFrom: 1,
        contentTo: 12,
        from: 0,
        kind: 'emphasis',
        syntaxRanges: [
          { from: 0, to: 1 },
          { from: 12, to: 13 }
        ],
        text: '**小火箭方法。 **',
        to: 13
      },
      {
        contentFrom: 3,
        contentTo: 10,
        from: 1,
        kind: 'strong',
        syntaxRanges: [
          { from: 1, to: 3 },
          { from: 10, to: 12 }
        ],
        text: '小火箭方法。 ',
        to: 12
      }
    ]);
  });
});
