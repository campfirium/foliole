import { expect, it } from 'vitest';

import { resolveTextAnchorDecorationsWithHighlightPreview } from './codeMirrorHighlightRangePreview';

it('previews cloze text anchor range moves by node id', () => {
  expect(resolveTextAnchorDecorationsWithHighlightPreview({
    preview: { nodeId: 'cloze-1', range: { from: 0, to: 10 } },
    textAnchorDecorations: [
      { from: 6, kind: 'cloze', nodeId: 'cloze-1', to: 10 },
      { from: 6, kind: 'highlight', nodeId: 'highlight-1', to: 10 }
    ]
  })).toEqual([
    { from: 0, kind: 'cloze', nodeId: 'cloze-1', to: 10 },
    { from: 6, kind: 'highlight', nodeId: 'highlight-1', to: 10 }
  ]);
});
