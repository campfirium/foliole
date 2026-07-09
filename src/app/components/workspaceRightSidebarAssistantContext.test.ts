import { expect, it } from 'vitest';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';

import { resolveAssistantWorkspaceContext } from './workspaceRightSidebarAssistantContext';
import { createAssistantPanelNode as createNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';

it('includes loaded active topic body and direct child summaries', () => {
  const context = resolveAssistantWorkspaceContext('topic', {
    childA: createNode({
      id: 'childA',
      hasContent: true,
      openingText: 'A short opening preview',
      parentNodeId: 'topic',
      specialKind: 'virtual',
      title: 'Child A',
      updatedAt: '2026-07-07T02:00:00.000Z'
    }),
    childB: createNode({
      anchorLink: { id: 'anchor-b', kind: 'highlight' },
      id: 'childB',
      content: 'B body fallback should not win',
      openingText: 'B opening',
      parentNodeId: 'topic',
      title: 'Child B',
      updatedAt: '2026-07-07T03:00:00.000Z'
    }),
    parent: createNode({ id: 'parent', title: 'Parent' }),
    topic: createNode({
      bodyStatus: 'ready',
      content: `# Topic\n\n${'Body '.repeat(900)}`,
      id: 'topic',
      manualChildOrder: ['childB', 'childA'],
      parentNodeId: 'parent',
      title: 'Topic'
    })
  });

  expect(context).toMatchObject({
    activeKind: 'topic',
    activeNodeId: 'topic',
    activeParentNodeId: 'parent',
    document: { bodyStatus: 'ready', truncated: true },
    folder: {
      childCount: 2,
      children: [
        { anchorKind: 'highlight', nodeId: 'childB', preview: 'B opening', title: 'Child B' },
        { nodeId: 'childA', preview: 'A short opening preview', specialKind: 'virtual', title: 'Child A' }
      ],
      truncated: false
    },
    path: ['Parent', 'Topic'],
    schemaVersion: 1,
    scope: 'node'
  });
  expect(context.document?.preview?.length).toBeGreaterThan(200);
});

it('falls back to loaded child body when a folder child has no opening preview', () => {
  const context = resolveAssistantWorkspaceContext('folder', {
    child: createNode({
      bodyStatus: 'ready',
      content: 'Loaded child body that should summarize in folder context',
      id: 'child',
      parentNodeId: 'folder',
      title: 'Child'
    }),
    folder: createNode({
      id: 'folder',
      kind: 'folder',
      title: 'Folder'
    })
  });

  expect(context.folder?.children).toEqual([
    expect.objectContaining({
      nodeId: 'child',
      preview: 'Loaded child body that should summarize in folder context',
      title: 'Child'
    })
  ]);
});

it('does not include unloaded active topic body as empty content', () => {
  const context = resolveAssistantWorkspaceContext('topic', {
    topic: createNode({
      bodyStatus: 'missing',
      content: '',
      hasContent: true,
      id: 'topic',
      title: 'Topic'
    })
  });

  expect(context.document).toEqual({ bodyStatus: 'missing' });
});

it('includes current editor selection when available', () => {
  const adapter = createSelectionAdapter('Alpha Beta Gamma Delta', [
    { from: 6, to: 10 },
    { from: 10, to: 16 }
  ]);
  const context = resolveAssistantWorkspaceContext('topic', {
    topic: createNode({
      bodyStatus: 'ready',
      content: 'Alpha Beta Gamma Delta',
      id: 'topic',
      title: 'Topic'
    })
  }, adapter);

  expect(context.selection).toEqual({
    charCount: 'Beta Gamma'.length,
    ranges: [{ from: 6, to: 16 }],
    text: 'Beta Gamma',
    truncated: false
  });
});

it('limits folder context to direct child summaries with stable node ids', () => {
  const nodes = Object.fromEntries(
    Array.from({ length: 32 }, (_, index) => [
      `child-${index}`,
      createNode({
        id: `child-${index}`,
        openingText: `Opening ${index}`,
        parentNodeId: 'folder',
        title: `Child ${index}`
      })
    ])
  );
  const context = resolveAssistantWorkspaceContext('folder', {
    ...nodes,
    folder: createNode({
      id: 'folder',
      kind: 'folder',
      manualChildOrder: ['child-31', 'child-30'],
      title: 'Folder'
    })
  });

  expect(context.folder).toMatchObject({ childCount: 32, truncated: true });
  expect(context.folder?.children.slice(0, 2)).toMatchObject([
    { nodeId: 'child-31', preview: 'Opening 31', title: 'Child 31' },
    { nodeId: 'child-30', preview: 'Opening 30', title: 'Child 30' }
  ]);
  expect(context.folder?.children).toHaveLength(30);
});

it('treats special folder entries as active folder context', () => {
  const context = resolveAssistantWorkspaceContext('special-inbox', {
    'special-inbox': createNode({
      id: 'special-inbox',
      kind: 'folder',
      specialKind: 'inbox',
      title: 'Inbox'
    }),
    topic: createNode({
      id: 'topic',
      openingText: 'Inbox topic preview',
      parentNodeId: 'special-inbox',
      title: 'Inbox topic'
    })
  });

  expect(context).toMatchObject({
    activeKind: 'folder',
    activeNodeId: 'special-inbox',
    activeSpecialKind: 'inbox',
    activeTitle: 'Inbox',
    folder: {
      childCount: 1,
      children: [{ nodeId: 'topic', preview: 'Inbox topic preview', title: 'Inbox topic' }],
      truncated: false
    },
    path: ['Inbox'],
    schemaVersion: 1,
    scope: 'node'
  });
  expect(context.document).toBeUndefined();
});

it('includes anchor context with the parent material id for derived nodes', () => {
  const context = resolveAssistantWorkspaceContext('highlight', {
    highlight: createNode({
      anchorLink: {
        id: 'anchor-1',
        kind: 'highlight',
        locator: { from: 6, originalText: 'selected source text', to: 26 }
      },
      id: 'highlight',
      parentNodeId: 'parent',
      title: 'Highlight note'
    }),
    parent: createNode({
      content: 'Parent source body',
      id: 'parent',
      title: 'Parent source'
    })
  });

  expect(context).toMatchObject({
    activeKind: 'topic',
    activeNodeId: 'highlight',
    activeParentNodeId: 'parent',
    activeTitle: 'Highlight note',
    anchor: {
      id: 'anchor-1',
      kind: 'highlight',
      parentNodeId: 'parent',
      parentTitle: 'Parent source',
      text: 'selected source text'
    },
    path: ['Parent source', 'Highlight note'],
    schemaVersion: 1,
    scope: 'node'
  });
});

function createSelectionAdapter(content: string, ranges: EditorSelection[]) {
  return {
    getContent: () => content,
    getSelectionRanges: () => ranges
  } as EditorAdapter;
}
