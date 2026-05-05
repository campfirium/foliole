export function stagePendingNode1Sync() {
  window.localStorage.setItem(
    'foliole-pending-node-sync-v1',
    JSON.stringify({
      nodesById: {
        'node-1': {
          nodeId: 'node-1',
          parentNodeId: null,
          priority: null,
          desiredRetention: null,
          title: 'Node 1',
          isTitleManual: false,
          hideTitleHeading: false,
          content: 'Pending node 1 body',
          reveal: null,
          anchorLink: null,
          reading: null,
          position: 0,
          createdAt: '2026-03-06T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z'
        }
      }
    })
  );
}

export function stageLegacyWorkspacePayload() {
  window.localStorage.setItem(
    'foliole-workspace-v1',
    JSON.stringify({
      state: {
        activeNodeId: 'node-2',
        nodeOrder: ['node-1', 'node-2', 'node-3'],
        nodesById: {
          'node-1': { id: 'node-1', content: 'Pending node 1 body', hasContent: true, hasReveal: false, reveal: null },
          'node-2': { id: 'node-2', content: 'Active node 2 body', hasContent: true, hasReveal: true, reveal: 'Active node 2 answer' },
          'node-3': { id: 'node-3', content: 'Unexpected node 3 body', hasContent: true, hasReveal: true, reveal: 'Unexpected node 3 answer' }
        },
        trashedNodeIds: []
      },
      version: 0
    })
  );
}

export function readWorkspaceNodesFromPayload(value: string | null) {
  if (!value) {
    return null;
  }
  return (JSON.parse(value) as {
    state: { nodesById: Record<string, { content: string; reveal: string | null }> };
  }).state.nodesById;
}
