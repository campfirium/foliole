import { afterEach, expect, it, vi } from 'vitest';

import { resolveCompanionSelectionCommandPayload } from './companionSelectionCommandPayload';

import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';

afterEach(() => {
  vi.restoreAllMocks();
});

function stubReadableDomSelection() {
  const host = document.createElement('div');
  host.className = 'cm-content';
  const textNode = document.createTextNode('Repeat');
  host.append(textNode);
  document.body.append(host);
  vi.spyOn(window, 'getSelection').mockReturnValue({
    anchorNode: textNode,
    focusNode: textNode,
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ bottom: 30, height: 20, left: 80, right: 140, top: 10, width: 60 }),
      getClientRects: () => ({
        0: { height: 20, left: 80, right: 140, top: 10 },
        length: 1
      })
    }),
    isCollapsed: false,
    rangeCount: 1,
    toString: () => 'Repeat'
  } as unknown as Selection);
}

it('uses DOM selection geometry before repeated selected text fallback', () => {
  stubReadableDomSelection();
  const adapter = {
    getContent: () => 'Repeat first. Repeat second.',
    getDocumentPositionAtClientPoint: vi.fn((clientX: number) => (clientX < 100 ? 14 : 20)),
    getSelectionRanges: vi.fn(() => [])
  } as unknown as EditorAdapter;

  const payload = resolveCompanionSelectionCommandPayload('topic-1', adapter);

  expect(payload?.entries[0]?.locator).toEqual({ from: 14, originalText: 'Repeat', to: 20 });
});