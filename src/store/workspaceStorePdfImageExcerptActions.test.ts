import { expect, it, vi } from 'vitest';

import { settleEditorAnnotationCreation } from './workspaceEditorAnnotationCreationSettlement';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';
import { createPdfImageExcerptAction } from './workspaceStorePdfImageExcerptActions';

it('uses the existing optimistic mutation settlement owner for image excerpts', async () => {
  const fixture = createWorkspaceNodeActionsFixture();
  const settle = vi.fn();
  fixture.settleEditorAnnotationCreation = settle;
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const syncCreation = vi.fn(async (args) => ({
    activeNodeId: args.activeNodeId,
    createdNodeIds: [args.node.id],
    nodeOrder: args.nodeOrder,
    nodes: [{
      nodeId: args.node.id, parentNodeId: args.node.parentNodeId, kind: args.node.kind,
      title: args.node.title, isTitleManual: false, hideTitleHeading: false, content: args.node.content,
      reveal: null, anchorLink: args.node.anchorLink, imageRegions: null, position: args.position,
      createdAt: args.node.createdAt, updatedAt: args.node.updatedAt, priority: null,
      desiredRetention: null, enableShortTerm: null, sequentialReadingEnabled: null, shelvedAt: null,
      manualChildOrder: null, virtualFilter: null, reading: null, review: null
    }]
  }));
  const createExcerpt = createPdfImageExcerptAction(harness.setState, syncCreation, harness.getState);
  const nodeId = await createExcerpt('node-1', 2, {
    page: 2, x: 0.1, y: 0.2, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }]
  }, 'a'.repeat(64), 'png');
  expect(nodeId).toMatch(/^node-/);
  expect(syncCreation).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: 'a'.repeat(64) }));
  expect(settle).toHaveBeenCalledWith({ annotationNodeIds: [nodeId], nodeId: 'node-1', succeeded: true });
  expect(harness.getState().nodesById[nodeId!]?.anchorLink?.kind).toBe('image-excerpt');
});

it('rolls back the optimistic excerpt through the existing settlement owner when persistence fails', async () => {
  const fixture = createWorkspaceNodeActionsFixture();
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  fixture.settleEditorAnnotationCreation = (result) => {
    settleEditorAnnotationCreation(harness.setState, result);
  };
  const createExcerpt = createPdfImageExcerptAction(harness.setState, async () => null, harness.getState);

  const nodeId = await createExcerpt('node-1', 1, {
    page: 1, x: 0, y: 0, rects: [{ x: 0, y: 0, width: 1, height: 1 }]
  }, 'b'.repeat(64), 'png');

  expect(nodeId).toBeNull();
  expect(Object.values(harness.getState().nodesById).some((node) => node.anchorLink?.kind === 'image-excerpt'))
    .toBe(false);
});
