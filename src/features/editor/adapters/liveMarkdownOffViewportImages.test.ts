import type { Range } from '@codemirror/state';
import { Text } from '@codemirror/state';
import type { Decoration } from '@codemirror/view';
import { expect, it } from 'vitest';

import { collectImageMatches } from '../model/markdownImageMatches';

import { addOffViewportImageDecorations } from './liveMarkdownOffViewportImages';

const hash = 'c'.repeat(64);
const image = `![Long](asset://${hash}.png)`;

function decorate(source: string, viewportLineFroms: number[], codeLineFroms: number[] = []) {
  const ranges: Range<Decoration>[] = [];
  addOffViewportImageDecorations(ranges, Text.of(source.split('\n')), {
    codeLineFroms: new Set(codeLineFroms),
    documentImageMatches: collectImageMatches(0, source),
    imageClozePresentationVersion: 0,
    localDocumentPath: null,
    markdownSyntaxVisible: false,
    nodeId: 'node',
    onMissingAttachmentResource: null,
    source,
    viewportLineFroms: new Set(viewportLineFroms)
  });
  return ranges.map(({ from, to }) => [from, to]);
}

it('keeps the image replacement on lines outside the viewport', () => {
  const source = `Intro\n\n${image}\n\nText`;
  expect(decorate(source, [0])).toEqual([[7, 7 + image.length]]);
});

it('leaves viewport lines and code lines to their own decorations', () => {
  const source = `Intro\n\n${image}\n\nText`;
  expect(decorate(source, [7])).toEqual([]);
  expect(decorate(source, [0], [7])).toEqual([]);
});
