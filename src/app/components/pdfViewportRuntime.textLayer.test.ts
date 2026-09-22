import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { usePdfSearchEffect } from './PdfDocumentSearch';
import { usePdfViewportRuntime } from './pdfViewportRuntime';

vi.mock('./PdfDocumentViewportParts', () => ({
  usePageJumpEffect: vi.fn(),
  useViewportTransformAnchor: vi.fn(),
  useVisiblePageSync: () => vi.fn()
}));

const MATCHES = [{ id: '8:0', page: 8, matchStart: 0, fragments: [{ page: 8, start: 0, end: 6 }] }];
afterEach(() => vi.unstubAllGlobals());

it('restores the active highlight after the same page text layer is rebuilt', () => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  const { result } = renderHook(() => {
    const runtime = usePdfViewportRuntime({
      clearPageJumpRequest: vi.fn(), page: 8, pageJumpRequest: null, pdfSource: 'pdf',
      rotation: 0, searchQuery: 'needle', searchRequest: null, searchTarget: null,
      setVisibleLocation: vi.fn(), totalPages: 40, zoom: 100
    });
    usePdfSearchEffect({
      ...runtime, matches: MATCHES, onSearchDebugChange: runtime.setSearchDebug,
      onSearchHighlightsChange: runtime.setSearchHighlights, onSearchStatusChange: vi.fn(),
      searchQuery: 'needle', searchRequest: null, searchTarget: null, totalPages: 40
    });
    return runtime;
  });
  const shell = document.createElement('div');
  const rebuildText = () => {
    shell.innerHTML = '<div class="textLayer"><span>needle</span></div>';
    shell.getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
    shell.querySelector('span')!.getBoundingClientRect = () => new DOMRect(60, 150, 80, 20);
  };
  rebuildText();
  result.current.pageElementsRef.current[8] = shell;
  result.current.scrollContainerRef.current = document.createElement('div');
  act(() => result.current.handleTextLayerRender(8));
  expect(result.current.searchHighlights[0]?.rects).toHaveLength(1);
  shell.replaceChildren();
  act(() => result.current.setSearchRevision((revision) => revision + 1));
  expect(result.current.searchHighlights[0]?.rects).toHaveLength(0);
  rebuildText();
  act(() => result.current.handleTextLayerRender(8));
  expect(result.current.searchHighlights[0]?.isActive).toBe(true);
  expect(result.current.searchHighlights[0]?.rects).toHaveLength(1);
});
