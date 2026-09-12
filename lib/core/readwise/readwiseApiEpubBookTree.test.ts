// @vitest-environment node

import { expect, it } from 'vitest';

import { buildReadwiseApiEpubBookNodes } from './readwiseApiEpubBookTree.js';

it('maps each Reader EPUB marker to exactly one body topic', () => {
  const nodes = buildReadwiseApiEpubBookNodes([
    { content: '# Part 1\n\nPart body', headingLevel: 1, markerKey: 'part', title: 'Part 1' },
    { content: 'Ordinary paragraph', headingLevel: null, markerKey: 'paragraph', title: 'Ordinary paragraph' },
    { content: '## Chapter 1\n\nChapter body', headingLevel: 2, markerKey: 'chapter', title: 'Chapter 1' },
    { content: '### Unmarked heading stays here', headingLevel: 2, markerKey: 'next', title: 'Chapter 2' }
  ]);

  expect(nodes).toEqual([
    { attachmentIds: [], content: '# Part 1\n\nPart body', key: 'part', parentKey: null, title: 'Part 1' },
    {
      attachmentIds: [],
      content: 'Ordinary paragraph',
      key: 'paragraph',
      parentKey: null,
      title: 'Ordinary paragraph'
    },
    {
      attachmentIds: [],
      content: '## Chapter 1\n\nChapter body',
      key: 'chapter',
      parentKey: 'part',
      title: 'Chapter 1'
    },
    {
      attachmentIds: [],
      content: '### Unmarked heading stays here',
      key: 'next',
      parentKey: 'part',
      title: 'Chapter 2'
    }
  ]);
  expect(nodes).toHaveLength(4);
  expect(nodes.some((node) => node.key.endsWith(':chapter-body'))).toBe(false);
});

it('merges reliable fourth through sixth level content into the closest third level topic', () => {
  const nodes = buildReadwiseApiEpubBookNodes([
    { content: '# Volume', headingLevel: 1, markerKey: 'volume', naturalLevel: 1, title: 'Volume' },
    { content: '## Chapter', headingLevel: 2, markerKey: 'chapter', naturalLevel: 2, title: 'Chapter' },
    { content: '### Section', headingLevel: 3, markerKey: 'section', naturalLevel: 3, title: 'Section' },
    { content: '#### Detail\n\nDetail body', headingLevel: 4, markerKey: 'detail', naturalLevel: 4, title: 'Detail' },
    { content: '##### Fine\n\nFine body', headingLevel: 5, markerKey: 'fine', naturalLevel: 5, title: 'Fine' },
    { content: '###### Finest\n\nFinest body', headingLevel: 6, markerKey: 'finest', naturalLevel: 6, title: 'Finest' }
  ]);

  expect(nodes).toHaveLength(3);
  expect(nodes[2]).toMatchObject({ key: 'section', parentKey: 'chapter' });
  expect(nodes[2]?.content).toContain('#### Detail');
  expect(nodes[2]?.content).toContain('###### Finest');
});
