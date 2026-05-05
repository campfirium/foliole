import { describe, expect, it, vi } from 'vitest';

import { revealEditorSelection } from './codeMirrorSelectionActions';

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
});
