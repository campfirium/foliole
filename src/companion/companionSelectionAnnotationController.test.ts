import { expect, it, vi } from 'vitest';

import { createCompanionSelectionAnnotationHandler } from './companionSelectionAnnotationController';

const persistCompanionSelectionAnnotation = vi.hoisted(() => vi.fn());

vi.mock('./companionSelectionAnnotationActions', () => ({
  addNoteToCompanionExistingHighlight: vi.fn(),
  deleteCompanionExistingHighlight: vi.fn(),
  persistCompanionSelectionAnnotation
}));

it('keeps the readable parent active after creating a selection annotation', async () => {
  const snapshot = { nodesById: {}, nodeOrder: [], trashedNodeIds: [] };
  const replaceSnapshot = vi.fn();
  const workspaceSync = {
    bootstrapState: { device_id: 'android-device' },
    replaceSnapshot,
    state: { workspace_snapshot: snapshot }
  };
  persistCompanionSelectionAnnotation.mockResolvedValue({
    nodeId: 'highlight-1',
    snapshot: { ...snapshot, activeNodeId: 'parent-1' }
  });

  const payload = {
    anchorId: 'anchor-1',
    clozeContent: 'Alpha [...]',
    entries: [{
      anchorId: 'anchor-1',
      clozeContent: 'Alpha [...]',
      locator: { from: 6, originalText: 'Beta', to: 10 },
      range: { from: 6, to: 10 },
      selectionText: 'Beta'
    }],
    parentNodeId: 'parent-1',
    selectionText: 'Beta'
  };

  await createCompanionSelectionAnnotationHandler(workspaceSync as never)('highlight', payload);

  expect(replaceSnapshot).toHaveBeenCalledWith(expect.any(Object), 'parent-1');
});
