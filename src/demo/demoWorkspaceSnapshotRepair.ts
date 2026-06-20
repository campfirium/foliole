import type { Node } from '../features/nodes/model/nodeTypes';
import type { WorkspacePersistedState } from '../store/workspaceStore';

import { DEFAULT_DEMO_TOPIC, DEMO_TOPICS } from './demoContent';

export function repairDemoWorkspacePayload(raw: string, pathname = '/demo/'): string | null {
  try {
    const payload = JSON.parse(raw) as { state?: WorkspacePersistedState; version?: number };
    if (!payload.state?.nodesById) return null;
    const nodesById = repairInlineDocumentNodes(payload.state.nodesById);
    const state = routeStateToDemoPath({ ...payload.state, nodesById }, pathname);
    if (nodesById === payload.state.nodesById && state === payload.state) return null;
    return JSON.stringify({
      ...payload,
      state
    });
  } catch {
    return null;
  }
}

function repairInlineDocumentNodes(nodesById: Record<string, Node | undefined>) {
  let changed = false;
  const nextNodesById: Record<string, Node | undefined> = {};
  Object.entries(nodesById).forEach(([nodeId, node]) => {
    const nextNode = repairInlineDocumentNode(node);
    if (nextNode !== node) changed = true;
    nextNodesById[nodeId] = nextNode;
  });
  return changed ? nextNodesById : nodesById;
}

function repairInlineDocumentNode(node: Node | undefined) {
  if (!node) return node;
  const content = typeof node.content === 'string' ? node.content : '';
  const reveal = typeof node.reveal === 'string' ? node.reveal : null;
  const hasContent = content.trim().length > 0;
  const hasReveal = reveal !== null;
  const bodyStatus = hasContent ? 'ready' : 'empty';
  if (
    node.content === content
    && node.reveal === reveal
    && node.bodyStatus === bodyStatus
    && node.hasContent === hasContent
    && node.hasReveal === hasReveal
  ) {
    return node;
  }
  return {
    ...node,
    content,
    reveal,
    bodyStatus,
    hasContent,
    hasReveal
  } satisfies Node;
}

function routeStateToDemoPath(state: WorkspacePersistedState, pathname: string) {
  const routedNodeId = resolveDemoNodeIdFromPath(pathname);
  if (!routedNodeId || !state.nodesById[routedNodeId]) return state;
  if (state.activeNodeId === routedNodeId && state.reviewSession.currentNodeId === routedNodeId) return state;
  const queueNodeIds = [routedNodeId, ...state.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== routedNodeId)];
  return {
    ...state,
    activeNodeId: routedNodeId,
    reviewSession: {
      ...state.reviewSession,
      currentNodeId: routedNodeId,
      isAnswerRevealed: false,
      queueNodeIds,
      totalNodeCount: Math.max(state.reviewSession.totalNodeCount, queueNodeIds.length)
    }
  };
}

function resolveDemoNodeIdFromPath(pathname: string) {
  const slug = pathname === '/demo/'
    ? DEFAULT_DEMO_TOPIC?.slug
    : /^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?demo\/([^/]+)\/?$/i.exec(pathname)?.[1];
  return DEMO_TOPICS.some((topic) => topic.slug === slug) ? `demo-${slug}` : null;
}
