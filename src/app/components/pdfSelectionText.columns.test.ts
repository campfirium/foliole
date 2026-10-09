import { afterEach, expect, it, vi } from 'vitest';

import { createTestDomRectList } from '../../test/domGeometryTestSupport';

import { resolvePdfSelectionLocator, resolvePdfSelectionText } from './pdfSelectionText';

afterEach(() => {
  vi.restoreAllMocks();
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

function selectAcrossFragments(rects: DOMRect[], reverse: boolean) {
  const surface = document.createElement('div');
  surface.dataset.pdfPageNumber = '2';
  const left = document.createTextNode('Left column end ');
  const right = document.createTextNode('right column start');
  const first = document.createElement('span');
  const second = document.createElement('span');
  first.append(left);
  second.append(right);
  surface.append(first, second);
  document.body.append(surface);
  surface.getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
  const selection = window.getSelection();
  if (!selection) throw new Error('Selection API unavailable');
  selection.setBaseAndExtent(reverse ? right : left, reverse ? right.length : 0, reverse ? left : right, reverse ? 0 : right.length);
  const range = selection.getRangeAt(0);
  Object.defineProperty(range, 'getClientRects', { value: () => createTestDomRectList(rects) });
  Object.defineProperty(range, 'getBoundingClientRect', { value: () => new DOMRect(40, 60, 460, 700) });
  const originalCreateRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const fragment = originalCreateRange();
    Object.defineProperty(fragment, 'getClientRects', { configurable: true, value: () => {
      const box = fragment.startContainer === left ? rects[0] : rects[1];
      return createTestDomRectList(box ? [box] : []);
    } });
    return fragment;
  });
  return { selection, surface };
}

function covers(rects: ReturnType<typeof resolvePdfSelectionLocator>, box: DOMRect) {
  const x = (box.x + box.width / 2) / 600;
  const y = (box.y + box.height / 2) / 800;
  return rects?.rects?.some(rect => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height);
}

it.each([false, true])('preserves both selected columns with reverse=%s', reverse => {
  const fragments = [new DOMRect(40, 740, 160, 14), new DOMRect(330, 60, 180, 14)];
  const { selection, surface } = selectAcrossFragments(fragments, reverse);
  expect(resolvePdfSelectionText(surface, selection)).toBe('Left column end right column start');
  const locator = resolvePdfSelectionLocator(surface, selection);
  for (const fragment of fragments) expect(covers(locator, fragment)).toBe(true);
});

it('preserves a selected fragment that starts further left on a slightly lower baseline', () => {
  const fragments = [new DOMRect(300, 100, 80, 14), new DOMRect(40, 102, 200, 14)];
  const { selection, surface } = selectAcrossFragments(fragments, false);
  const locator = resolvePdfSelectionLocator(surface, selection);
  for (const fragment of fragments) expect(covers(locator, fragment)).toBe(true);
});

it('highlights selected text without painting the full-page selection helper between fragments', () => {
  const fragments = [new DOMRect(40, 60, 160, 14), new DOMRect(330, 80, 180, 14)];
  const { selection, surface } = selectAcrossFragments([...fragments, new DOMRect(0, 0, 600, 800)], false);
  const helper = document.createElement('div');
  helper.className = 'endOfContent';
  surface.insertBefore(helper, surface.lastChild);
  const locator = resolvePdfSelectionLocator(surface, selection);
  expect(covers(locator, new DOMRect(240, 400, 10, 10))).toBe(false);
  for (const fragment of fragments) expect(covers(locator, fragment)).toBe(true);
});
