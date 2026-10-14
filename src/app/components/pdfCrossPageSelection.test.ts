import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { getPdfAnchorLocators } from '../../features/nodes/model/nodeTypes';
import { createTestDomRectList } from '../../test/domGeometryTestSupport';

import { usePdfSelectedPageNumbers } from './pdfSelectionPages';
import { resolvePdfSelectionSnapshot } from './pdfSelectionRuntime';
import { resolveRenderablePageNumbers } from './pdfViewportPageNumbers';

function fixture(texts = ['First page ending', 'Second page beginning']) {
  const surface = document.createElement('div');
  surface.dataset.testid = 'pdf-document-surface';
  const nodes: Text[] = [];
  const pageElements: Record<number, HTMLElement | null> = {};
  texts.forEach((text, index) => {
    const shell = document.createElement('div');
    shell.dataset.pdfPageNumber = String(index + 1);
    shell.innerHTML = '<div data-testid="pdf-document-page"><div data-testid="pdf-official-text-layer" data-pdf-text-layer-state="ready"><div class="textLayer"><span></span></div></div></div><button>Excluded control</button>';
    const span = shell.querySelector('span');
    const node = document.createTextNode(text);
    span?.append(node);
    nodes.push(node);
    const frame = shell.querySelector<HTMLElement>('[data-testid="pdf-document-page"]');
    if (frame) frame.getBoundingClientRect = () => new DOMRect(0, index * 200, 400, 200);
    pageElements[index + 1] = shell;
    surface.append(shell);
  });
  document.body.append(surface);
  const createRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = createRange();
    Object.defineProperty(range, 'getClientRects', { value: () => {
      const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const page = Number(element?.closest<HTMLElement>('[data-pdf-page-number]')?.dataset.pdfPageNumber ?? 1);
      return createTestDomRectList([new DOMRect(40, (page - 1) * 200 + 20, 100, 10)]);
    } });
    return range;
  });
  const selection = window.getSelection();
  if (!selection || !nodes[0] || !nodes[texts.length - 1]) throw new Error('Selection unavailable');
  return { surface, nodes, selection, pageElements };
}

function selectAll(input: ReturnType<typeof fixture>, reverse = false) {
  const first = input.nodes[0]!;
  const last = input.nodes[input.nodes.length - 1]!;
  input.selection.setBaseAndExtent(reverse ? last : first, reverse ? last.length : 0,
    reverse ? first : last, reverse ? 0 : last.length);
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it.each([false, true])('captures all text in document order and each page in its own geometry, reverse=%s', reverse => {
  const input = fixture();
  selectAll(input, reverse);
  const snapshot = resolvePdfSelectionSnapshot(input.surface);
  expect(snapshot?.selectionText).toBe('First page ending\nSecond page beginning');
  const fragments = getPdfAnchorLocators(snapshot?.locator);
  expect(fragments.map(fragment => fragment.page)).toEqual([1, 2]);
  for (const fragment of fragments) {
    expect(fragment.x).toBeCloseTo(0.225);
    expect(fragment.y).toBeCloseTo(0.125);
    expect(fragment.rects).toHaveLength(1);
    expect(fragment.rects?.[0]?.x).toBeCloseTo(0.1);
    expect(fragment.rects?.[0]?.y).toBeCloseTo(0.1);
    expect(fragment.rects?.[0]?.width).toBeCloseTo(0.25);
    expect(fragment.rects?.[0]?.height).toBeCloseTo(0.05);
  }
});

it('rejects loading, failed and missing text layers on the second page', () => {
  const input = fixture();
  selectAll(input);
  expect(getPdfAnchorLocators(resolvePdfSelectionSnapshot(input.surface)?.locator).map(page => page.page)).toEqual([1, 2]);
  const host = input.pageElements[2]?.querySelector<HTMLElement>('[data-testid="pdf-official-text-layer"]');
  if (!host) throw new Error('Missing host');
  for (const state of ['loading', 'failed']) {
    host.dataset.pdfTextLayerState = state;
    expect(resolvePdfSelectionSnapshot(input.surface)).toBeNull();
  }
  host.remove();
  expect(resolvePdfSelectionSnapshot(input.surface)).toBeNull();
});

it('retains the complete native selection beyond the viewport and releases on cancellation', () => {
  const input = fixture();
  const { result, unmount } = renderHook(() => usePdfSelectedPageNumbers({ current: input.pageElements }));
  selectAll(input);
  fireEvent(document, new Event('selectionchange'));
  expect(result.current).toEqual([1, 2]);
  const args = { page: 5, totalPages: 10, highlightLocators: [], searchHighlights: [], searchQuery: '', pdfSelectionLocator: undefined };
  expect(resolveRenderablePageNumbers({ ...args, retainedPageNumbers: result.current })).toEqual([1, 2, 3, 4, 5, 6, 7]);
  input.selection.removeAllRanges();
  fireEvent(document, new Event('selectionchange'));
  expect(result.current).toEqual([]);
  unmount();
});
