import { describe, expect, it, vi } from 'vitest';

import { stabilizePdfTextSelectionToClosestRow } from './pdfSelectionRuntime';

function mockRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top
  } as DOMRect;
}

function defineRect(element: HTMLElement, rect: DOMRect) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect
  });
}

function defineCaretRange(startNode: Node, startOffset: number) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.collapse(true);
  Object.defineProperty(document, 'caretRangeFromPoint', {
    configurable: true,
    value: vi.fn(() => range)
  });
  return range;
}

describe('stabilizePdfTextSelectionToClosestRow', () => {
  it('clamps drag selection to the nearest row edge when the pointer moves beyond the row width', () => {
    const { leftText, rightText, selection, surface, textLayer } = createTwoSpanSelectionFixture();
    defineCaretRange(rightText, 4);

    const stabilized = stabilizePdfTextSelectionToClosestRow(surface, selection, textLayer, 180, 48);

    expect(stabilized).toBe(true);
    expect(selection.setBaseAndExtent).toHaveBeenCalledWith(leftText, 0, rightText, 4);

    surface.remove();
  });

  it('does nothing while the pointer stays inside the current text row bounds', () => {
    const { selection, surface, textLayer } = createSingleSpanSelectionFixture();
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn()
    });

    const stabilized = stabilizePdfTextSelectionToClosestRow(surface, selection, textLayer, 60, 48);

    expect(stabilized).toBe(false);
    expect(selection.setBaseAndExtent).not.toHaveBeenCalled();

    surface.remove();
  });
});

function createTwoSpanSelectionFixture() {
    const surface = document.createElement('div');
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    const leftText = document.createTextNode('Alpha');
    const rightText = document.createTextNode('Beta');
    const leftSpan = document.createElement('span');
    const rightSpan = document.createElement('span');
    leftSpan.appendChild(leftText);
    rightSpan.appendChild(rightText);
    textLayer.append(leftSpan, rightSpan);
    surface.appendChild(textLayer);
    document.body.appendChild(surface);

    defineRect(leftSpan, mockRect(20, 40, 44, 16));
    defineRect(rightSpan, mockRect(68, 40, 36, 16));

    const selection = {
      anchorNode: leftText,
      anchorOffset: 0,
      focusNode: rightText,
      focusOffset: 1,
      isCollapsed: false,
      rangeCount: 1,
      setBaseAndExtent: vi.fn()
    } as unknown as Selection;

    return { leftText, rightText, selection, surface, textLayer };
}

function createSingleSpanSelectionFixture() {
    const surface = document.createElement('div');
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    const text = document.createTextNode('Alpha beta');
    const span = document.createElement('span');
    span.appendChild(text);
    textLayer.appendChild(span);
    surface.appendChild(textLayer);
    document.body.appendChild(surface);

    defineRect(span, mockRect(20, 40, 84, 16));

    const selection = {
      anchorNode: text,
      anchorOffset: 0,
      focusNode: text,
      focusOffset: 3,
      isCollapsed: false,
      rangeCount: 1,
      setBaseAndExtent: vi.fn()
    } as unknown as Selection;

    return { selection, surface, textLayer };
}
