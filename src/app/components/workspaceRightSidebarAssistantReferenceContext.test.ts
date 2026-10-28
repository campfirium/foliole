import { expect, it } from 'vitest';

import { createAssistantPanelNode as createNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';
import { resolveAssistantTurnReferenceContext } from './workspaceRightSidebarAssistantReferenceContext';

it('keeps a missing current material explicit instead of substituting another topic', () => {
  expect(resolveAssistantTurnReferenceContext({
    followCurrentMaterial: true,
    location: { nodeId: 'missing', type: 'node' },
    nodesById: { other: createNode({ id: 'other' }) }
  })).toEqual({
    activeNodeId: 'missing', document: { bodyStatus: 'missing' }, schemaVersion: 1, scope: 'node'
  });
});

it('keeps anchor identity and ancestor paths without collecting material contents', () => {
  const parent = createNode({ id: 'parent', title: 'Parent' });
  const child = createNode({
    id: 'child', title: 'Highlight', parentNodeId: parent.id,
    anchorLink: { id: 'anchor', kind: 'highlight', locator: { from: 0, to: 6, originalText: 'secret' } }
  });
  Object.defineProperty(parent, 'content', { get: () => { throw new Error('Unexpected body read'); } });
  Object.defineProperty(child, 'content', { get: () => { throw new Error('Unexpected body read'); } });
  expect(resolveAssistantTurnReferenceContext({
    followCurrentMaterial: true,
    location: { nodeId: child.id, type: 'node' },
    nodesById: { parent, child }
  })).toEqual({
    activeKind: 'topic', activeNodeId: child.id, activeParentNodeId: parent.id, activeTitle: 'Highlight',
    anchor: { id: 'anchor', kind: 'highlight', parentNodeId: parent.id, parentTitle: 'Parent' },
    path: ['Parent', 'Highlight'], schemaVersion: 1, scope: 'node'
  });
});
