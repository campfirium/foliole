import { expect, it, vi } from 'vitest';

import { createPastedTextAnchorsHandler } from './appControllerPastedTextAnchors';

function createArgs(overrides?: {
  handleCreateClozeFromPayload?: ReturnType<typeof vi.fn>;
  handleCreateHighlightFromPayload?: ReturnType<typeof vi.fn>;
  isViewingTrashNode?: boolean;
}) {
  return {
    editorCtx: {
      handleCreateClozeFromPayload: overrides?.handleCreateClozeFromPayload ?? vi.fn(),
      handleCreateHighlightFromPayload: overrides?.handleCreateHighlightFromPayload ?? vi.fn()
    },
    runtime: {
      isViewingTrashNode: overrides?.isViewingTrashNode ?? false
    }
  } as never;
}

function expectSortedPastedAnchorPayloads(args: {
  handleCreateClozeFromPayload: ReturnType<typeof vi.fn>;
  handleCreateHighlightFromPayload: ReturnType<typeof vi.fn>;
}) {
  expect(args.handleCreateHighlightFromPayload).toHaveBeenCalledWith({
    anchorId: expect.any(String),
    clozeContent: 'Start [...] Gamma',
    entries: [
      expect.objectContaining({
        locator: {
          from: 6,
          originalText: 'Alpha Beta',
          to: 16
        },
        range: {
          from: 6,
          to: 16
        },
        selectionText: 'Alpha Beta'
      })
    ],
    parentNodeId: 'node-1',
    selectionText: 'Alpha Beta'
  });
  expect(args.handleCreateClozeFromPayload).toHaveBeenCalledWith({
    anchorId: expect.any(String),
    clozeContent: 'Start Alpha Beta [...]',
    entries: [
      expect.objectContaining({
        locator: {
          from: 17,
          originalText: 'Gamma',
          to: 22
        },
        range: {
          from: 17,
          to: 22
        },
        selectionText: 'Gamma'
      })
    ],
    parentNodeId: 'node-1',
    selectionText: 'Gamma'
  });
  expect(args.handleCreateHighlightFromPayload.mock.invocationCallOrder[0]).toBeLessThan(
    args.handleCreateClozeFromPayload.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  );
}

it('recreates pasted text anchors in document order from the pasted content', () => {
  const handleCreateHighlightFromPayload = vi.fn();
  const handleCreateClozeFromPayload = vi.fn();
  const handler = createPastedTextAnchorsHandler(
    createArgs({
      handleCreateClozeFromPayload,
      handleCreateHighlightFromPayload
    })
  );

  handler({
    anchors: [
      { from: 17, kind: 'cloze', to: 22 },
      { from: 6, kind: 'highlight', to: 16 }
    ],
    content: 'Start Alpha Beta Gamma',
    nodeId: 'node-1'
  });

  expectSortedPastedAnchorPayloads({
    handleCreateClozeFromPayload,
    handleCreateHighlightFromPayload
  });
});

it('ignores pasted anchors while viewing the trash node', () => {
  const handleCreateHighlightFromPayload = vi.fn();
  const handler = createPastedTextAnchorsHandler(
    createArgs({
      handleCreateHighlightFromPayload,
      isViewingTrashNode: true
    })
  );

  handler({
    anchors: [{ from: 0, kind: 'highlight', to: 5 }],
    content: 'Alpha Beta',
    nodeId: 'node-1'
  });

  expect(handleCreateHighlightFromPayload).not.toHaveBeenCalled();
});

it('skips empty pasted anchor ranges that no longer resolve to text', () => {
  const handleCreateHighlightFromPayload = vi.fn();
  const handler = createPastedTextAnchorsHandler(
    createArgs({
      handleCreateHighlightFromPayload
    })
  );

  handler({
    anchors: [{ from: 4, kind: 'highlight', to: 4 }],
    content: 'Alpha Beta',
    nodeId: 'node-1'
  });

  expect(handleCreateHighlightFromPayload).not.toHaveBeenCalled();
});
