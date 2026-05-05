import { describe, expect, it } from 'vitest';

import { measurePdfTextLayerCropBox, resolvePdfCropScale } from './pdfAutoCrop';

function mockRect(element: Element, rect: Partial<DOMRect>) {
  element.getBoundingClientRect = () => ({
    bottom: rect.bottom ?? 0,
    height: rect.height ?? 0,
    left: rect.left ?? 0,
    right: rect.right ?? 0,
    top: rect.top ?? 0,
    width: rect.width ?? 0,
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    toJSON: () => ({})
  } as DOMRect);
}

describe('pdfAutoCrop', () => {
  it('measures a padded crop box from rendered text spans', () => {
    const page = document.createElement('div');
    const layer = document.createElement('div');
    const span = document.createElement('span');
    layer.className = 'textLayer';
    span.textContent = 'Body';
    layer.append(span);
    page.append(layer);
    mockRect(page, { height: 800, left: 100, top: 50, width: 600 });
    mockRect(span, { bottom: 730, height: 20, left: 160, right: 620, top: 120, width: 460 });

    expect(measurePdfTextLayerCropBox(page)).toEqual({
      bottom: 736,
      left: 0,
      right: 592,
      top: 14
    });
  });

  it('does not auto zoom cropped pages', () => {
    expect(resolvePdfCropScale(600, { bottom: 700, left: 100, right: 300, top: 40 })).toBe(1);
  });

  it('keeps enough horizontal page area to avoid clipping text on small screens', () => {
    const page = document.createElement('div');
    const layer = document.createElement('div');
    const span = document.createElement('span');
    layer.className = 'textLayer';
    span.textContent = 'Narrow body';
    layer.append(span);
    page.append(layer);
    mockRect(page, { height: 800, left: 0, top: 0, width: 600 });
    mockRect(span, { bottom: 620, height: 20, left: 220, right: 320, top: 180, width: 100 });

    expect(measurePdfTextLayerCropBox(page)).toMatchObject({
      left: 0,
      right: 576
    });
  });
});
