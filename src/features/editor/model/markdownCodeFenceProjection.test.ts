import { describe, expect, it, vi } from 'vitest';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import {
  collectMarkdownCodeFenceProjection,
  collectMarkdownCodeFenceProjectionFromTree
} from './markdownCodeFenceProjection';

function materializeProjection(text: string) {
  const projection = collectMarkdownCodeFenceProjection(text);
  return {
    codeBlocks: projection.codeBlocks,
    codeLineFroms: Array.from(projection.codeLineFroms),
    fenceLineFroms: Array.from(projection.fenceLineFroms)
  };
}

describe('markdownCodeFenceProjection', () => {
  it('collects parser-backed fence and code line starts', () => {
    const text = 'Before\n```ts\n# no\n- item\n```\nAfter';

    expect(materializeProjection(text)).toEqual({
      codeBlocks: [{ blockFrom: 7, blockTo: 28, codeFrom: 13, codeTo: 24, diagramKind: null, language: 'typescript' }],
      codeLineFroms: [13, 18],
      fenceLineFroms: [7, 25]
    });
  });

  it('treats an unclosed fenced code block as code through the final code text', () => {
    const text = '```ts\n# no';

    expect(materializeProjection(text)).toEqual({
      codeBlocks: [{ blockFrom: 0, blockTo: 10, codeFrom: 6, codeTo: 10, diagramKind: null, language: 'typescript' }],
      codeLineFroms: [6],
      fenceLineFroms: [0]
    });
  });

  it('normalizes the first info string token and falls back for unknown languages', () => {
    const text = '```TS title="x"\nconst x = 1\n```\n\n```brain\nx\n```';

    expect(materializeProjection(text)).toEqual({
      codeBlocks: [
        { blockFrom: 0, blockTo: 31, codeFrom: 16, codeTo: 27, diagramKind: null, language: 'typescript' },
        { blockFrom: 33, blockTo: 47, codeFrom: 42, codeTo: 43, diagramKind: null, language: null }
      ],
      codeLineFroms: [16, 42],
      fenceLineFroms: [0, 28, 33, 44]
    });
  });

  it('classifies mermaid fences as diagram blocks', () => {
    const text = '```mermaid\ngantt\n  title Plan\n```';

    expect(materializeProjection(text)).toEqual({
      codeBlocks: [{ blockFrom: 0, blockTo: 33, codeFrom: 11, codeTo: 29, diagramKind: 'mermaid', language: null }],
      codeLineFroms: [11, 17],
      fenceLineFroms: [0, 30]
    });
  });

  it('collects offset code fence projection from a shared tree without reparsing', () => {
    const text = '```ts\nconst x = 1\n```';
    const tree = folioleMarkdownParser.parse(text);
    const parseSpy = vi.spyOn(folioleMarkdownParser, 'parse');
    parseSpy.mockClear();

    expect(collectMarkdownCodeFenceProjectionFromTree(tree, text, 10)).toEqual(
      collectMarkdownCodeFenceProjection(text, 10)
    );
    expect(parseSpy).toHaveBeenCalledTimes(1);
    parseSpy.mockRestore();
  });
});
