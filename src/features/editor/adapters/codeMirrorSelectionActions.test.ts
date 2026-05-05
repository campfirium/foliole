import { describe, expect, it, vi } from 'vitest';

import { revealEditorSelection, revealEditorSelectionCentered, revealEditorSelectionNearest } from './codeMirrorSelectionActions';

function createViewHarness() {
  return {
    coordsAtPos: vi.fn(() => ({ top: 240 })),
    dispatch: vi.fn(),
    focus: vi.fn(),
    requestMeasure: vi.fn(),
    scrollDOM: {
      clientHeight: 400,
      getBoundingClientRect: () => ({ height: 400, top: 100 }),
      scrollHeight: 4000,
      scrollTop: 0
    }
  } as const;
}

describe('codeMirrorSelectionActions', () => {
  it('does not trigger native scrollIntoView before viewport-ratio alignment', () => {
    const view = createViewHarness();

    revealEditorSelection(view as never, { from: 120, to: 140 }, (position) => position, 0.24);

    expect(view.dispatch).toHaveBeenCalledWith({
      scrollIntoView: false,
      selection: { anchor: 120, head: 140 }
    });
    expect(view.focus).toHaveBeenCalledTimes(1);
    expect(view.requestMeasure).toHaveBeenCalledTimes(1);
  });

  it('still uses native scrollIntoView for plain selection reveal', () => {
    const view = createViewHarness();

    revealEditorSelection(view as never, { from: 8, to: 10 }, (position) => position);

    expect(view.dispatch).toHaveBeenCalledWith({
      scrollIntoView: true,
      selection: { anchor: 8, head: 10 }
    });
  });

  it('uses nearest native scroll strategy for nearest selection reveal', () => {
    const view = createViewHarness();

    revealEditorSelectionNearest(view as never, { from: 30, to: 36 }, (position) => position);

    expect(view.dispatch).toHaveBeenCalledWith({
      effects: expect.anything(),
      scrollIntoView: false,
      selection: { anchor: 30, head: 36 }
    });
    expect(view.focus).toHaveBeenCalledTimes(1);
  });

  it('keeps the current focus owner when centered reveal asks to preserve focus', () => {
    const view = createViewHarness();

    revealEditorSelectionCentered(view as never, { from: 30, to: 36 }, (position) => position, {
      preserveFocus: true
    });

    expect(view.dispatch).toHaveBeenCalledWith({
      effects: expect.anything(),
      scrollIntoView: false,
      selection: { anchor: 30, head: 36 }
    });
    expect(view.focus).not.toHaveBeenCalled();
  });
});
