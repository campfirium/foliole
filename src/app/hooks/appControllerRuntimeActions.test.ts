import { describe, expect, it, vi } from 'vitest';

import { createRevealDocumentPosition } from './appControllerRuntimeActions';

describe('createRevealDocumentPosition', () => {
  it('stores the revealed document position as the new reading anchor', () => {
    const revealPosition = vi.fn();
    const getScrollTop = vi.fn(() => 320);
    const setNodeViewState = vi.fn();

    const revealDocumentPosition = createRevealDocumentPosition({
      runtime: {
        editorRef: {
          current: {
            getScrollTop,
            revealPosition
          }
        },
        isViewingTrashNode: false
      },
      ws: {
        activeNodeId: 'node-1',
        setNodeViewState
      }
    } as never);

    revealDocumentPosition(48000);

    expect(revealPosition).toHaveBeenCalledWith(48000);
    expect(setNodeViewState).toHaveBeenCalledWith('node-1', {
      scrollTop: 320,
      selection: { from: 48000, to: 48000 }
    });
  });
});
