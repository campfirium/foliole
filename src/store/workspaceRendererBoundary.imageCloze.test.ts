import { afterEach, expect, it } from 'vitest';

import {
  markNodeContentEdited,
  resetNodeContentVersionGuardForTests
} from './workspaceNodeContentVersionGuard';
import { enforceWorkspaceRendererBoundary, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { createInitialWorkspaceState } from './workspaceStore';

afterEach(() => {
  resetNodeContentVersionGuardForTests();
});

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

it('keeps dirty local content when hydrating a stale runtime document', () => {
  const seedNode = createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')).nodesById['node-1']!;
  markNodeContentEdited('node-1');

  const mergedNode = mergeWorkspaceNodeDocument(
    {
      ...seedNode,
      id: 'node-1',
      content: '# Local draft',
      hasContent: true,
      updatedAt: '2026-03-20T00:00:01.000Z'
    },
    {
      content: '',
      hideTitleHeading: false,
      kind: 'topic',
      reveal: null,
      virtualFilter: null
    }
  );

  expect(mergedNode.content).toBe('# Local draft');
  expect(mergedNode.hasContent).toBe(true);
  expect(mergedNode.bodyStatus).toBe('ready');
});

it('loads runtime content over an empty renderer boundary projection with the same timestamp', () => {
  const seedNode = createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')).nodesById['node-1']!;

  const mergedNode = mergeWorkspaceNodeDocument(
    {
      ...seedNode,
      id: 'node-1',
      content: '',
      hasContent: true,
      updatedAt: '2026-03-20T00:00:01.000Z'
    },
    {
      content: '# Runtime body',
      hideTitleHeading: false,
      kind: 'topic',
      reveal: null,
      updatedAt: '2026-03-20T00:00:01.000Z',
      virtualFilter: null
    }
  );

  expect(mergedNode.content).toBe('# Runtime body');
  expect(mergedNode.hasContent).toBe(true);
  expect(mergedNode.bodyStatus).toBe('ready');
});
