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

export function stagePendingNodeDocument() {
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
          content: 'Pending node 1 draft',
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

export function stagePendingAnchorChildNode() {
  window.localStorage.setItem(
    'foliole-pending-node-sync-v1',
    JSON.stringify({
      nodesById: {
        'node-highlight': {
          nodeId: 'node-highlight',
          parentNodeId: 'node-2',
          kind: 'topic',
          priority: null,
          desiredRetention: null,
          title: 'Better',
          isTitleManual: false,
          hideTitleHeading: false,
          content: 'Better',
          reveal: null,
          anchorLink: {
            id: 'hl-1',
            kind: 'highlight',
            locator: {
              from: 6,
              originalText: 'Better',
              to: 12
            }
          },
          reading: null,
          position: 1,
          createdAt: '2026-03-06T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z'
        }
      }
    })
  );
}

export function stagePendingUnresolvedAnchorChildNode() {
  window.localStorage.setItem(
    'foliole-pending-node-sync-v1',
    JSON.stringify({
      nodesById: {
        'node-highlight': {
          nodeId: 'node-highlight',
          parentNodeId: 'node-2',
          kind: 'topic',
          priority: null,
          desiredRetention: null,
          title: 'Beta',
          isTitleManual: false,
          hideTitleHeading: false,
          content: 'Beta',
          reveal: null,
          anchorLink: {
            id: 'hl-1',
            kind: 'highlight',
            locator: {
              from: 6,
              originalText: 'Beta',
              to: 6
            }
          },
          reading: null,
          position: 1,
          createdAt: '2026-03-06T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z'
        }
      }
    })
  );
}

export function stagePendingUnresolvedClozeChildNode() {
  window.localStorage.setItem(
    'foliole-pending-node-sync-v1',
    JSON.stringify({
      nodesById: {
        'node-cloze': {
          nodeId: 'node-cloze',
          parentNodeId: 'node-2',
          kind: 'item',
          priority: null,
          desiredRetention: null,
          title: 'Alpha [...] Gamma',
          isTitleManual: false,
          hideTitleHeading: false,
          content: 'Alpha [...] Gamma',
          reveal: 'Beta',
          anchorLink: {
            id: 'cloze-1',
            kind: 'cloze',
            locator: {
              from: 6,
              originalText: 'Beta',
              to: 6
            }
          },
          reading: null,
          position: 1,
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
