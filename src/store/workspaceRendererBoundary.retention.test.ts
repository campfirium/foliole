import { afterEach, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import {
  readCachedWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentCacheForTest
} from './workspaceNodeDocumentCache';
import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
import { createInitialWorkspaceState } from './workspaceStore';

afterEach(() => {
  resetWorkspaceNodeDocumentCacheForTest();
});

it('does not pin all loaded children of a large active folder', () => {
  const currentState = createInitialWorkspaceState(new Date('2026-09-22T00:00:00.000Z'));
  const seedNode = currentState.nodesById['node-1']!;
  const folder: Node = {
    ...seedNode,
    id: 'folder-1',
    kind: 'folder',
    content: 'Folder body',
    hasContent: true,
    title: 'Large folder'
  };
  const children = Object.fromEntries(
    Array.from({ length: 10_000 }, (_, index) => {
      const id = `child-${index}`;
      return [id, {
        ...seedNode,
        id,
        parentNodeId: folder.id,
        content: index === 9_999 ? '---\nauthor: Ada\n---\nLast body' : `Body ${index}`,
        hasContent: true,
        imageRegions: index === 9_999 ? [{ attachmentId: 'cover', regions: [] }] : null,
        imageSources: index === 9_999 ? { cover: 'asset://cover.png' } : null,
        title: `Child ${index}`
      } satisfies Node];
    })
  );
  const nodesById = { [folder.id]: folder, ...children };

  const result = enforceWorkspaceRendererBoundary<{
    activeNodeId: string | null;
    nodesById: Record<string, Node>;
  }>(
    { activeNodeId: folder.id, nodesById },
    {
      activeNodeId: currentState.activeNodeId,
      nodesById: currentState.nodesById,
      rendererBoundaryKeepNodeIds: []
    }
  ) as { nodesById: Record<string, Node> };

  expect(result.nodesById[folder.id]?.content).toBe('Folder body');
  expect(Object.values(result.nodesById).filter((node) => node.content.length > 0)).toHaveLength(1);
  expect(result.nodesById['child-9999']).toMatchObject({
    authorText: 'Ada',
    content: '',
    imageRegions: [{ attachmentId: 'cover', regions: [] }],
    imageSources: null
  });
  expect(readCachedWorkspaceNodeDocument('child-0')).toBeNull();
  expect(readCachedWorkspaceNodeDocument('child-9999')?.content).toContain('Last body');
});
