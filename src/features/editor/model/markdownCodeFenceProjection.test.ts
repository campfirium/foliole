import { describe, expect, it } from 'vitest';

import { collectMarkdownCodeFenceProjection } from './markdownCodeFenceProjection';

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
      codeBlocks: [{ codeFrom: 13, codeTo: 24, language: 'typescript' }],
      codeLineFroms: [13, 18],
      fenceLineFroms: [7, 25]
    });
  });

  it('treats an unclosed fenced code block as code through the final code text', () => {
    const text = '```ts\n# no';

    expect(materializeProjection(text)).toEqual({
      codeBlocks: [{ codeFrom: 6, codeTo: 10, language: 'typescript' }],
      codeLineFroms: [6],
      fenceLineFroms: [0]
    });
  });

  it('normalizes the first info string token and falls back for unknown languages', () => {
    const text = '```TS title="x"\nconst x = 1\n```\n\n```brain\nx\n```';

    expect(materializeProjection(text)).toEqual({
      codeBlocks: [
        { codeFrom: 16, codeTo: 27, language: 'typescript' },
        { codeFrom: 42, codeTo: 43, language: null }
      ],
      codeLineFroms: [16, 42],
      fenceLineFroms: [0, 28, 33, 44]
    });
  });
});
