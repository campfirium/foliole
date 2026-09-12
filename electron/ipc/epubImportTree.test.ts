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
      degradedReason: 'EPUB TOC fragment could not be matched: OPS/text/chapter-3.xhtml#s1',
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

it('splits repeated same-file toc fragment entries into their matching markdown sections', () => {
  const nodes = buildBookNodes({
    chapters: [
      {
        content: '# Copyright\n\nLegal text.\n\n# Chapter 1\n\nIntro body.\n\n# Chapter 2\n\nSecond body.',
        degradedReason: null,
        embeddedImages: [],
        href: 'OPS/book.xhtml',
        key: 'book',
        parentKey: null,
        title: 'Copyright'
      }
    ],
    toc: [
      {
        children: [],
        href: 'OPS/book.xhtml#copyright',
        title: 'Copyright'
      },
      {
        children: [],
        href: 'OPS/book.xhtml#chapter-1',
        title: 'Chapter 1'
      },
      {
        children: [],
        href: 'OPS/book.xhtml#chapter-2',
        title: 'Chapter 2'
      }
    ]
  });

  expect(nodes.map((node) => [node.key, node.title, node.content])).toEqual([
    ['book::copyright', 'Copyright', '# Copyright\n\nLegal text.'],
    ['book::chapter-1', 'Chapter 1', '# Chapter 1\n\nIntro body.'],
    ['book::chapter-2', 'Chapter 2', '# Chapter 2\n\nSecond body.']
  ]);
});

it('marks unresolved same-file toc fragments as degraded instead of silently importing empty sections', () => {
  const nodes = buildBookNodes({
    chapters: [
      {
        content: '# Real Chapter\n\nReadable body.',
        degradedReason: null,
        embeddedImages: [],
        href: 'OPS/book.xhtml',
        key: 'book',
        parentKey: null,
        title: 'Real Chapter'
      }
    ],
    toc: [
      {
        children: [],
        href: 'OPS/book.xhtml#missing-fragment',
        title: 'Missing Chapter'
      }
    ]
  });

  expect(nodes).toEqual([
    {
      content: '',
      degradedReason: 'EPUB TOC fragment could not be matched: OPS/book.xhtml#missing-fragment',
      embeddedImages: [],
      key: 'toc-1',
      parentKey: null,
      title: 'Missing Chapter'
    }
  ]);
});

it('uses the navigation tree once and fills its body from an otherwise unconsumed same-title spine chapter', () => {
  const nodes = buildBookNodes({
    chapters: [
      {
        content: '# Wrong body\n\nWrong chapter.', degradedReason: null, embeddedImages: [],
        href: 'OPS/shared.xhtml', key: 'shared', parentKey: null, title: 'Other chapter'
      },
      {
        content: '# Chapter 2\n\nCorrect body.', degradedReason: null, embeddedImages: [],
        href: 'OPS/chapter-2.xhtml', key: 'chapter-2', parentKey: null, title: 'Chapter 2'
      },
      {
        content: '# Contents\n\nNavigation links.', degradedReason: null, embeddedImages: [],
        href: 'OPS/contents.xhtml', key: 'contents', parentKey: null, title: 'Contents'
      }
    ],
    toc: [{
      children: [{ children: [], href: 'OPS/shared.xhtml', title: 'Chapter 2' }],
      href: null,
      title: 'Volume One'
    }]
  });

  expect(nodes.map((node) => [node.title, node.parentKey, node.content])).toEqual([
    ['Volume One', null, '**Volume One**'],
    ['Chapter 2', 'toc-1', '# Chapter 2\n\nCorrect body.']
  ]);
});

it('splits repeated unanchored toc references by their explicit headings', () => {
  const nodes = buildBookNodes({
    chapters: [{
      content: '# Chapter 1\n\nFirst body.\n\n# Chapter 2\n\nSecond body.',
      degradedReason: null, embeddedImages: [], href: 'OPS/shared.xhtml',
      key: 'shared', parentKey: null, title: 'Chapter 1'
    }],
    toc: [
      { children: [], href: 'OPS/shared.xhtml', title: 'Chapter 1' },
      { children: [], href: 'OPS/shared.xhtml', title: 'Chapter 2' }
    ]
  });

  expect(nodes.map((node) => [node.title, node.content])).toEqual([
    ['Chapter 1', '# Chapter 1\n\nFirst body.'],
    ['Chapter 2', '# Chapter 2\n\nSecond body.']
  ]);
  expect(new Set(nodes.map((node) => node.key))).toHaveLength(2);
});
