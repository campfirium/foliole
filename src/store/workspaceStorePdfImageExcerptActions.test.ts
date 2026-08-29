import { expect, it, vi } from 'vitest';

import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { settleEditorAnnotationCreation } from './workspaceEditorAnnotationCreationSettlement';
import type { WorkspaceState } from './workspaceStore';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';
import { createPdfImageExcerptAction } from './workspaceStorePdfImageExcerptActions';

function confirmCreation(args: { activeNodeId: string; node: WorkspaceState['nodesById'][string]; nodeOrder: string[]; position: number }): WorkspaceNodeMutationPatchResult {
  return {
    activeNodeId: args.activeNodeId,
    createdNodeIds: [args.node.id],
    nodeOrder: args.nodeOrder,
    nodes: [
      {
        nodeId: args.node.id,
        parentNodeId: args.node.parentNodeId,
        kind: args.node.kind,
        title: args.node.title,
        isTitleManual: false,
        hideTitleHeading: false,
        content: args.node.content,
        reveal: null,
        anchorLink: args.node.anchorLink ?? null,
        imageRegions: null,
        position: args.position,
        createdAt: args.node.createdAt,
        updatedAt: args.node.updatedAt,
        priority: null,
        desiredRetention: null,
        enableShortTerm: null,
        sequentialReadingEnabled: null,
        shelvedAt: null,
        manualChildOrder: null,
        virtualFilter: null,
        reading: null,
        review: null
      }
    ]
  };
}

it('uses the existing optimistic mutation settlement owner for image excerpts', async () => {
  const fixture = createWorkspaceNodeActionsFixture();
  const settle = vi.fn();
  fixture.settleEditorAnnotationCreation = settle;
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const syncCreation = vi.fn(async (args) => confirmCreation(args));
  const createExcerpt = createPdfImageExcerptAction(harness.setState, syncCreation, harness.getState);
  const nodeId = await createExcerpt(
    'node-1',
    2,
    {
      page: 2,
      x: 0.1,
      y: 0.2,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }]
    },
    'a'.repeat(64),
    'png'
  );
  expect(nodeId).toMatch(/^node-/);
  expect(syncCreation).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: 'a'.repeat(64) }));
  expect(settle).toHaveBeenCalledWith({
    annotationNodeIds: [nodeId],
    nodeId: 'node-1',
    succeeded: true
  });
  expect(harness.getState().nodesById[nodeId!]?.anchorLink?.kind).toBe('image-excerpt');
  expect(harness.getState().nodesById[nodeId!]?.title).toBe('Excerpt 1');
});

it('persists an annotated crop as the content of the same image excerpt creation', async () => {
  const fixture = createWorkspaceNodeActionsFixture();
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const syncCreation = vi.fn(async (args) => confirmCreation(args));
  const createExcerpt = createPdfImageExcerptAction(harness.setState, syncCreation, harness.getState);
  const locator = { page: 2, x: 0.1, y: 0.2, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }] };
  const attachmentId = 'a'.repeat(64);
  const content = `![Image excerpt](asset://${attachmentId}.png)\n※ Diagram thought`;

  const nodeId = await createExcerpt('node-1', 2, locator, attachmentId, 'png', content);

  expect(syncCreation).toHaveBeenCalledWith(
    expect.objectContaining({
      attachmentId,
      node: expect.objectContaining({ content })
    })
  );
  expect(harness.getState().nodesById[nodeId!]?.content).toBe(content);
});

it('numbers excerpts per source without reusing deleted numbers or overwriting manual titles', async () => {
  const fixture = createWorkspaceNodeActionsFixture();
  const secondParent = { ...fixture.nodesById['node-1']!, id: 'node-2', title: 'Second PDF' };
  fixture.nodesById['node-2'] = secondParent;
  fixture.nodeOrder.push('node-2');
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  const createExcerpt = createPdfImageExcerptAction(harness.setState, async (args) => confirmCreation(args), harness.getState);
  const locator = { page: 1, x: 0.1, y: 0.2, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }] };

  const first = (await createExcerpt('node-1', 1, locator, 'a'.repeat(64), 'png'))!;
  const second = (await createExcerpt('node-1', 4, { ...locator, page: 4 }, 'b'.repeat(64), 'png'))!;
  const otherSource = (await createExcerpt('node-2', 7, { ...locator, page: 7 }, 'c'.repeat(64), 'png'))!;
  harness.setState({
    nodesById: {
      ...harness.getState().nodesById,
      [second]: { ...harness.getState().nodesById[second]!, title: 'Diagram' }
    },
    trashedNodeIds: [first]
  });
  const third = (await createExcerpt('node-1', 1, locator, 'd'.repeat(64), 'png'))!;

  expect(harness.getState().nodesById[first]?.title).toBe('Excerpt 1');
  expect(harness.getState().nodesById[second]?.title).toBe('Diagram');
  expect(harness.getState().nodesById[third]?.title).toBe('Excerpt 3');
  expect(harness.getState().nodesById[otherSource]?.title).toBe('Excerpt 1');
  expect(harness.getState().untitledSequenceByParent).toMatchObject({
    'image-excerpt:node-1': 4,
    'image-excerpt:node-2': 2
  });
});

it('rolls back the optimistic excerpt through the existing settlement owner when persistence fails', async () => {
  const fixture = createWorkspaceNodeActionsFixture();
  const harness = createWorkspaceNodeActionsSetStateHarness(fixture);
  fixture.settleEditorAnnotationCreation = (result) => {
    settleEditorAnnotationCreation(harness.setState, result);
  };
  const createExcerpt = createPdfImageExcerptAction(harness.setState, async () => null, harness.getState);

  const nodeId = await createExcerpt(
    'node-1',
    1,
    {
      page: 1,
      x: 0,
      y: 0,
      rects: [{ x: 0, y: 0, width: 1, height: 1 }]
    },
    'b'.repeat(64),
    'png'
  );

  expect(nodeId).toBeNull();
  expect(Object.values(harness.getState().nodesById).some((node) => node.anchorLink?.kind === 'image-excerpt')).toBe(false);
});
