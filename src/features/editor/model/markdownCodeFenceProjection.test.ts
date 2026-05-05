import { describe, expect, it } from 'vitest';

import { collectMarkdownCodeFenceProjection } from './markdownCodeFenceProjection';

function materializeProjection(text: string) {
  const projection = collectMarkdownCodeFenceProjection(text);
  return {
    codeLineFroms: Array.from(projection.codeLineFroms),
    fenceLineFroms: Array.from(projection.fenceLineFroms)
  };
}

describe('markdownCodeFenceProjection', () => {
  it('collects parser-backed fence and code line starts', () => {
    const text = 'Before\n```ts\n# no\n- item\n```\nAfter';

    expect(materializeProjection(text)).toEqual({
      codeLineFroms: [13, 18],
      fenceLineFroms: [7, 25]
    });
  });

  it('treats an unclosed fenced code block as code through the final code text', () => {
    const text = '```ts\n# no';

    expect(materializeProjection(text)).toEqual({
      codeLineFroms: [6],
      fenceLineFroms: [0]
    });
  });
});
