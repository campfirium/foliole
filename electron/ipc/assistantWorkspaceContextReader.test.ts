// @vitest-environment node

import { expect, it } from 'vitest';

import { readOptionalWorkspaceContext } from './assistantWorkspaceContextReader.js';

it('sanitizes extended workspace context fields', () => {
  const context = readOptionalWorkspaceContext(createExtendedWorkspaceContext());

  expect(context).toMatchObject({
    activeKind: 'topic',
    activeNodeId: 'active-node',
    activeParentNodeId: 'parent-node',
    activeSpecialKind: 'inbox',
    activeTitle: 'Active title',
    anchor: {
      id: 'anchor-1',
      kind: 'highlight',
      page: 1,
      parentNodeId: 'parent-node',
      parentTitle: 'Parent title',
      text: 'a'.repeat(220)
    },
    document: {
      bodyStatus: 'ready',
      charCount: 4100,
      preview: 'x'.repeat(4000),
      truncated: true
    },
    folder: {
      childCount: 1,
      children: [{
        anchorKind: 'highlight',
        bodyStatus: 'ready',
        hasContent: true,
        kind: 'topic',
        nodeId: 'child-1',
        preview: 'p'.repeat(220),
        specialKind: 'virtual',
        title: 'Child'
      }],
      truncated: false
    },
    selection: {
      charCount: 5000,
      ranges: [
        { from: 0, to: 10 },
        { from: 20, to: 30 },
        { from: 40, to: 50 },
        { from: 60, to: 70 },
        { from: 80, to: 90 }
      ],
      text: 's'.repeat(1200),
      truncated: true
    },
    schemaVersion: 1,
    scope: 'node'
  });
  expect(context).not.toHaveProperty('unknown');
});

it('losslessly preserves image excerpt identity without inventing source text', () => {
  const context = readOptionalWorkspaceContext({
    anchor: { id: 'image-1', kind: 'image-excerpt', page: 3, parentNodeId: 'pdf-1' },
    folder: {
      childCount: 1,
      children: [{ anchorKind: 'image-excerpt', hasContent: true, kind: 'topic', nodeId: 'image-1', title: 'Image excerpt' }],
      truncated: false
    },
    schemaVersion: 1,
    scope: 'node'
  });

  expect(context?.anchor).toEqual({
    id: 'image-1', kind: 'image-excerpt', page: 3, parentNodeId: 'pdf-1'
  });
  expect(context?.folder?.children[0]?.anchorKind).toBe('image-excerpt');
  expect(context?.anchor).not.toHaveProperty('text');
});

function createExtendedWorkspaceContext() {
  return {
    activeKind: 'topic',
    activeNodeId: 'active-node',
    activeParentNodeId: 'parent-node',
    activeSpecialKind: 'inbox',
    activeTitle: 'Active title',
    anchor: createAnchorContext(),
    document: {
      bodyStatus: 'ready',
      charCount: 4100,
      preview: 'x'.repeat(4100),
      truncated: true,
      unknown: 'drop'
    },
    folder: createFolderContext(),
    scope: 'node',
    schemaVersion: 99,
    selection: createSelectionContext()
  };
}

function createAnchorContext() {
  return {
    id: 'anchor-1',
    kind: 'highlight',
    page: -2,
    parentNodeId: 'parent-node',
    parentTitle: 'Parent title',
    text: 'a'.repeat(300)
  };
}

function createFolderContext() {
  return {
    childCount: 1,
    children: [{
      anchorKind: 'highlight',
      bodyStatus: 'ready',
      hasContent: true,
      kind: 'topic',
      nodeId: 'child-1',
      preview: 'p'.repeat(300),
      specialKind: 'virtual',
      title: 'Child'
    }],
    truncated: false
  };
}

function createSelectionContext() {
  return {
    charCount: 5000,
    ranges: [
      { from: -5, to: 10, extra: true },
      { from: 20, to: 30 },
      { from: 40, to: 50 },
      { from: 60, to: 70 },
      { from: 80, to: 90 },
      { from: 100, to: 110 }
    ],
    text: 's'.repeat(1300),
    truncated: true
  };
}
