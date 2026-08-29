import { describe, expect, it } from 'vitest';

import { findPdfExcerptNearEdge, resolvePdfVisualExcerptPointerAction, resolvePdfVisualExcerptPointerKind } from './pdfVisualExcerptPointerRouting';

describe('PDF visual excerpt pointer routing', () => {
  it('routes only actual text spans to native text selection', () => {
    const page = document.createElement('div');
    page.innerHTML = '<div class="textLayer"><span id="text">Words</span><span id="end" class="endOfContent"></span></div><canvas id="canvas"></canvas>';

    expect(resolvePdfVisualExcerptPointerKind(page.querySelector('#text'))).toBe('text');
    expect(resolvePdfVisualExcerptPointerKind(page.querySelector('#end'))).toBe('visual');
    expect(resolvePdfVisualExcerptPointerKind(page.querySelector('#canvas'))).toBe('visual');
  });

  it('keeps interactive controls outside region creation', () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.append(icon);

    expect(resolvePdfVisualExcerptPointerKind(icon)).toBe('control');
    expect(resolvePdfVisualExcerptPointerAction(icon, true)).toBe('control');
  });

  it('lets an outline edge override text but not change the pointer-down owner later', () => {
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    const span = document.createElement('span');
    textLayer.append(span);

    expect(resolvePdfVisualExcerptPointerAction(span, true)).toBe('outline');
    expect(resolvePdfVisualExcerptPointerAction(span, false)).toBe('text');
  });

  it('selects only points close to an existing outline edge', () => {
    const rects = [{ nodeId: 'excerpt-1', rect: { height: 0.4, width: 0.4, x: 0.2, y: 0.2 } }];
    const tolerance = { x: 0.01, y: 0.01 };

    expect(findPdfExcerptNearEdge({ x: 0.205, y: 0.4 }, rects, tolerance)?.nodeId).toBe('excerpt-1');
    expect(findPdfExcerptNearEdge({ x: 0.4, y: 0.4 }, rects, tolerance)).toBeNull();
    expect(findPdfExcerptNearEdge({ x: 0.8, y: 0.8 }, rects, tolerance)).toBeNull();
  });

  it('selects the nearest border when excerpt outlines overlap', () => {
    const rects = [
      { nodeId: 'farther', rect: { height: 0.4, width: 0.4, x: 0.2, y: 0.2 } },
      { nodeId: 'nearest', rect: { height: 0.3, width: 0.3, x: 0.205, y: 0.25 } }
    ];

    expect(findPdfExcerptNearEdge(
      { x: 0.204, y: 0.3 }, rects, { x: 0.01, y: 0.01 }
    )?.nodeId).toBe('nearest');
  });
});
