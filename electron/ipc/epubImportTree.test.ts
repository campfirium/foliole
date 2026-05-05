import { expect, it } from 'vitest';

import { buildBookNodes } from './epubImportTree.js';

it('moves chapter intro content into the first child section when the chapter has nested toc sections', () => {
  const nodes = buildBookNodes({
    chapters: [
      {
        content: '# 第三章 越少越好\n\n告诉你一个秘密。',
        degradedReason: null,
        embeddedImages: [],
        href: 'OPS/text/chapter-3.xhtml',
        key: 'chapter-3',
        parentKey: null,
        title: '第三章 越少越好'
      }
    ],
    toc: [
      {
        children: [
          {
            children: [],
            href: 'OPS/text/chapter-3.xhtml#s1',
            title: '从流程开始'
          }
        ],
        href: 'OPS/text/chapter-3.xhtml',
        title: '第三章 越少越好'
      }
    ]
  });

  expect(nodes).toEqual([
    {
      content: '**第三章 越少越好**',
      degradedReason: null,
      embeddedImages: [],
      key: 'chapter-3',
      parentKey: null,
      title: '第三章 越少越好'
    },
    {
      content: '# 第三章 越少越好\n\n告诉你一个秘密。',
      degradedReason: null,
      embeddedImages: [],
      key: 'chapter-3::chapter-body',
      parentKey: 'chapter-3',
      title: '越少越好'
    },
    {
      content: '',
      degradedReason: null,
      embeddedImages: [],
      key: 'toc-1',
      parentKey: 'chapter-3',
      title: '从流程开始'
    }
  ]);
});

it('does not split chapter content when the toc chapter has no nested sections', () => {
  const nodes = buildBookNodes({
    chapters: [
      {
        content: '# Chapter 1\n\nIntro',
        degradedReason: null,
        embeddedImages: [],
        href: 'OPS/ch1.xhtml',
        key: 'chapter-1',
        parentKey: null,
        title: 'Chapter 1'
      }
    ],
    toc: [
      {
        children: [],
        href: 'OPS/ch1.xhtml',
        title: 'Chapter 1'
      }
    ]
  });

  expect(nodes).toEqual([
    {
      content: '# Chapter 1\n\nIntro',
      degradedReason: null,
      embeddedImages: [],
      key: 'chapter-1',
      parentKey: null,
      title: 'Chapter 1'
    }
  ]);
});
