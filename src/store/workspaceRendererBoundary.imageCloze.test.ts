import { expect, it } from 'vitest';

import { enforceWorkspaceRendererBoundary, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { createInitialWorkspaceState } from './workspaceStore';

it('clears image regions when a merged document removes them', () => {
  const seedNode = createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')).nodesById['node-1']!;
  const mergedNode = mergeWorkspaceNodeDocument(
    {
      ...seedNode,
      content: 'Body',
      hasContent: true,
      kind: 'topic',
      imageRegions: [
        {
          attachmentId: 'image-1',
          regions: [
            {
              id: 'region-1',
              x: 0.1,
              y: 0.2,
              width: 0.3,
              height: 0.4
            }
          ]
        }
      ]
    },
    {
      content: 'Body',
      hideTitleHeading: false,
      imageRegions: null,
      kind: 'topic',
      reveal: null,
      virtualFilter: null
    }
  );

  expect(mergedNode.imageRegions).toBeNull();
});

it('refreshes the active-node boundary projection when only image regions change', () => {
  const seedNode = createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')).nodesById['node-1']!;
  const currentState = {
    ...createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')),
    activeNodeId: 'node-1',
    rendererBoundaryKeepNodeIds: [],
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        ...seedNode,
        id: 'node-1',
        kind: 'topic' as const,
        content: '![Cover](asset://hash-1.png)',
        hasContent: true,
        imageRegions: [
          {
            attachmentId: 'hash-1',
            regions: [
              {
                id: 'region-1',
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.4
              }
            ]
          }
        ],
        reveal: null,
        hasReveal: false
      }
    },
    trashedNodeIds: []
  };

  const nextState = enforceWorkspaceRendererBoundary(
    {
      nodesById: {
        ...currentState.nodesById,
        'node-1': {
          ...currentState.nodesById['node-1']!,
          imageRegions: null,
          updatedAt: '2026-03-20T00:00:01.000Z'
        }
      }
    },
    currentState
  ) as typeof currentState;

  expect(nextState.nodesById['node-1']?.imageRegions).toBeNull();
});
