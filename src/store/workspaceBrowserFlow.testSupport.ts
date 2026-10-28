import type { Node } from '../features/nodes/model/nodeTypes';
import { emptyBrowserDailyFlow } from '../shared/platform/runtime/browserDailyFlowState';
import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';

import { installBrowserWorkspace } from './installBrowserWorkspace';
import { installWorkspaceBrowserCommit } from './workspaceBrowserCommit';
import { createEmptyReviewSession } from './workspaceReviewReading';
import { createInitialWorkspaceState, useWorkspaceStore as store } from './workspaceStore';

export const flowNow = '2026-10-28T08:00:00.000Z';
export function flowNode(id: string, item = false, extra: Partial<Node> = {}): Node {
  return { id, kind: item ? 'item' : 'topic', parentNodeId: null, title: id, content: `Body ${id}`,
    reveal: item ? 'Answer' : null, review: null, createdAt: flowNow, updatedAt: flowNow, ...extra };
}
export function browserFlow(nodes: Node[]) {
  installWorkspaceBrowserCommit(null);
  installBrowserDailyFlowRuntime(null);
  localStorage.clear();
  store.setState({ ...createInitialWorkspaceState(new Date(flowNow)), browserDailyFlow: emptyBrowserDailyFlow(),
    libraryScope: 'browser-workspace', nodeOrder: nodes.map(node => node.id),
    nodesById: Object.fromEntries(nodes.map(node => [node.id, node])), reviewSession: createEmptyReviewSession() });
  installBrowserWorkspace(store, localStorage, store.getState());
  return store;
}
