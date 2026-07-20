import { describe, expect, it, vi } from 'vitest';

import { createTestDomRectList } from '../../test/domGeometryTestSupport';

import { resolvePdfSelectionLocator, resolvePdfSelectionText } from './pdfSelectionText';

function createSelectionForNode(node: Text) {
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, node.textContent?.length ?? 0);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return selection;
}

describe('resolvePdfSelectionText range source', () => {
  it('returns selected text when the selection is inside the pdf surface', () => {
    const container = document.createElement('div');
    const textNode = document.createTextNode('Alpha beta');
    container.appendChild(textNode);
    document.body.appendChild(container);

    const selection = createSelectionForNode(textNode);
    expect(resolvePdfSelectionText(container, selection)).toBe('Alpha beta');

    selection?.removeAllRanges();
    container.remove();
  });

  it('uses Range contents when Selection serialization is empty', () => {
    const container = document.createElement('div');
    const first = document.createElement('span');
    const second = document.createElement('span');
    first.textContent = 'Alpha ';
    second.textContent = 'beta';
    container.append(first, second);
    document.body.appendChild(container);
    const range = document.createRange();
    range.setStart(first.firstChild as Text, 2);
    range.setEnd(second.firstChild as Text, 2);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const toStringSpy = vi.spyOn(selection as Selection, 'toString').mockReturnValue('');

    expect(resolvePdfSelectionText(container, selection)).toBe('pha be');
    expect(toStringSpy).not.toHaveBeenCalled();

    selection?.removeAllRanges();
    container.remove();
  });
});

describe('resolvePdfSelectionText normalization and boundary', () => {
  it('removes invisible pdf formatting characters and rejects invisible-only selections', () => {
    const container = document.createElement('div');
    const textNode = document.createTextNode('\ufeff\u200b\u00adVisible\u2060');
    container.appendChild(textNode);
    document.body.appendChild(container);
    const selection = createSelectionForNode(textNode);
    expect(resolvePdfSelectionText(container, selection)).toBe('Visible');

    textNode.textContent = '\ufeff\u200b\u00ad\u2060';
    const invisibleSelection = createSelectionForNode(textNode);
    expect(resolvePdfSelectionText(container, invisibleSelection)).toBe('');

    invisibleSelection?.removeAllRanges();
    container.remove();
  });

  it('normalizes a reverse selection with line breaks in DOM order', () => {
    const container = document.createElement('div');
    const textNode = document.createTextNode('Alpha\r\nBeta');
    container.appendChild(textNode);
    document.body.appendChild(container);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.setBaseAndExtent(textNode, textNode.length, textNode, 0);

    expect(resolvePdfSelectionText(container, selection)).toBe('Alpha\nBeta');

    selection?.removeAllRanges();
    container.remove();
  });

  it('returns empty when selection is outside the pdf surface', () => {
    const container = document.createElement('div');
    const outside = document.createElement('div');
    const outsideText = document.createTextNode('Outside text');
    outside.appendChild(outsideText);
    document.body.append(container, outside);

    const selection = createSelectionForNode(outsideText);
    expect(resolvePdfSelectionText(container, selection)).toBe('');

    selection?.removeAllRanges();
    container.remove();
    outside.remove();
  });

});

function runResolveLocatorInPageShellTest() {
  const container = document.createElement('div');
  const pageShell = document.createElement('div');
  pageShell.dataset.pdfPageNumber = '3';
  const textNode = document.createTextNode('Anchor text');
  pageShell.appendChild(textNode);
  container.appendChild(pageShell);
  document.body.appendChild(container);

  Object.defineProperty(pageShell, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ bottom: 260, height: 200, left: 10, right: 210, top: 60, width: 200, x: 10, y: 60, toJSON: () => ({}) })
  });
  const selection = createSelectionForNode(textNode);
  const range = selection?.getRangeAt(0);
  Object.defineProperty(range as Range, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ bottom: 130, height: 20, left: 60, right: 140, top: 110, width: 80, x: 60, y: 110, toJSON: () => ({}) })
  });
  Object.defineProperty(range as Range, 'getClientRects', {
    configurable: true,
    value: () =>
      createTestDomRectList([
        { bottom: 130, height: 20, left: 60, right: 140, top: 110, width: 80, x: 60, y: 110, toJSON: () => ({}) } as DOMRect,
        { bottom: 130, height: 20, left: 60, right: 140, top: 110, width: 80, x: 60, y: 110, toJSON: () => ({}) } as DOMRect
      ])
  });

  const locator = resolvePdfSelectionLocator(container, selection);
  expect(locator?.page).toBe(3);
  expect(locator?.x).toBe(0.45);
  expect(locator?.y).toBe(0.3);
  expect(locator?.rects).toHaveLength(1);
  expect(locator?.rects?.[0]?.x).toBe(0.25);
  expect(locator?.rects?.[0]?.y).toBe(0.25);
  expect(locator?.rects?.[0]?.width).toBe(0.4);
  expect(locator?.rects?.[0]?.height ?? 0).toBeCloseTo(0.1, 6);

  selection?.removeAllRanges();
  container.remove();
}

function runResolveLocatorWithPageFrameTest() {
  const container = document.createElement('div');
  const pageShell = document.createElement('div');
  pageShell.dataset.pdfPageNumber = '4';
  const pageFrame = document.createElement('div');
  pageFrame.dataset.testid = 'pdf-document-page';
  const textNode = document.createTextNode('Frame text');
  pageFrame.appendChild(textNode);
  pageShell.appendChild(pageFrame);
  container.appendChild(pageShell);
  document.body.appendChild(container);

  Object.defineProperty(pageShell, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ bottom: 300, height: 240, left: 20, right: 320, top: 60, width: 300, x: 20, y: 60, toJSON: () => ({}) })
  });
  Object.defineProperty(pageFrame, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ bottom: 300, height: 240, left: 60, right: 260, top: 60, width: 200, x: 60, y: 60, toJSON: () => ({}) })
  });

  const selection = createSelectionForNode(textNode);
  const range = selection?.getRangeAt(0);
  Object.defineProperty(range as Range, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ bottom: 140, height: 20, left: 100, right: 180, top: 120, width: 80, x: 100, y: 120, toJSON: () => ({}) })
  });
  Object.defineProperty(range as Range, 'getClientRects', {
    configurable: true,
    value: () =>
      createTestDomRectList([
        { bottom: 140, height: 20, left: 100, right: 180, top: 120, width: 80, x: 100, y: 120, toJSON: () => ({}) } as DOMRect
      ])
  });

  const locator = resolvePdfSelectionLocator(container, selection);
  expect(locator?.page).toBe(4);
  expect(locator?.x).toBe(0.4);
  expect(locator?.y).toBe(0.2916666666666667);
  expect(locator?.rects?.[0]?.x).toBe(0.2);
  expect(locator?.rects?.[0]?.y).toBe(0.25);
  expect(locator?.rects?.[0]?.width ?? 0).toBeCloseTo(0.4, 6);
  expect(locator?.rects?.[0]?.height ?? 0).toBeCloseTo(0.08333333333333333, 6);

  selection?.removeAllRanges();
  container.remove();
}

describe('resolvePdfSelectionLocator', () => {
  it('resolves page locator when selection is inside a page shell', () => {
    runResolveLocatorInPageShellTest();
  });

  it('uses pdf page frame instead of outer page shell to avoid horizontal offset', () => {
    runResolveLocatorWithPageFrameTest();
  });

  it('merges neighboring rects on the same line into one highlight band', () => {
    const container = document.createElement('div');
    const pageShell = document.createElement('div');
    pageShell.dataset.pdfPageNumber = '2';
    const textNode = document.createTextNode('Merged text');
    pageShell.appendChild(textNode);
    container.appendChild(pageShell);
    document.body.appendChild(container);

    Object.defineProperty(pageShell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 260, height: 200, left: 10, right: 210, top: 60, width: 200, x: 10, y: 60, toJSON: () => ({}) })
    });
    const selection = createSelectionForNode(textNode);
    const range = selection?.getRangeAt(0);
    Object.defineProperty(range as Range, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 130, height: 20, left: 60, right: 144, top: 110, width: 84, x: 60, y: 110, toJSON: () => ({}) })
    });
    Object.defineProperty(range as Range, 'getClientRects', {
    configurable: true,
    value: () =>
        createTestDomRectList([
          { bottom: 130, height: 20, left: 60, right: 96, top: 110, width: 36, x: 60, y: 110, toJSON: () => ({}) } as DOMRect,
          { bottom: 130, height: 20, left: 100, right: 144, top: 110, width: 44, x: 100, y: 110, toJSON: () => ({}) } as DOMRect
        ])
    });

    const locator = resolvePdfSelectionLocator(container, selection);
    expect(locator?.rects).toHaveLength(1);
    expect(locator?.rects?.[0]?.x).toBe(0.25);
    expect(locator?.rects?.[0]?.width ?? 0).toBeCloseTo(0.42, 6);

    selection?.removeAllRanges();
    container.remove();
  });
});
