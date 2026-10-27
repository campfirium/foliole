import type { Node } from '../features/nodes/model/nodeTypes';
import { HOME_NODE_ID, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import type { WorkspacePersistedState } from '../store/workspaceStore';

import { getDemoTopicsForLocale, getDemoTopicNodeId } from './demoContent';
import { DEMO_GUIDES_NODE_ID } from './demoGuides';
import { resolveDemoLocalePathSegment, resolveGuideSlugFromPath } from './demoRoutes';

export function repairDemoWorkspacePayload(raw: string, pathname = '/en/demo/'): string | null {
  try {
    const payload = JSON.parse(raw) as { state?: WorkspacePersistedState; version?: number };
    if (!payload.state?.nodesById) return null;
    const state = repairDemoWorkspaceState(payload.state, pathname);
    if (state === payload.state) return null;
    return JSON.stringify({
      ...payload,
      state
    });
  } catch {
    return null;
  }
}

export function repairDemoWorkspaceState(state: WorkspacePersistedState, pathname: string): WorkspacePersistedState {
  const nodesById = repairInlineDocumentNodes(state.nodesById);
  return repairDemoGuidesOrder(routeStateToDemoPath(nodesById === state.nodesById ? state : { ...state, nodesById,
    ...(state.browserDailyFlow?.state ? { browserDailyFlow: { ...state.browserDailyFlow,
      state: { ...state.browserDailyFlow.state, invalidated: 1 } } } : {}) }, pathname));
}

function repairDemoGuidesOrder(state: WorkspacePersistedState): WorkspacePersistedState {
  const guidesIndex = state.nodeOrder.indexOf(DEMO_GUIDES_NODE_ID);
  const inboxIndex = state.nodeOrder.indexOf(INBOX_NODE_ID);
  if (guidesIndex < 0 || inboxIndex < 0 || guidesIndex < inboxIndex) return state;
  return {
    ...state,
    nodeOrder: [
      ...(state.nodeOrder.includes(HOME_NODE_ID) ? [HOME_NODE_ID] : []),
      DEMO_GUIDES_NODE_ID,
      INBOX_NODE_ID,
      ...state.nodeOrder.filter((nodeId) => (
        nodeId !== HOME_NODE_ID &&
        nodeId !== DEMO_GUIDES_NODE_ID &&
        nodeId !== INBOX_NODE_ID
      ))
    ]
  };
}

function repairInlineDocumentNodes(nodesById: Record<string, Node | undefined>): Record<string, Node> {
  let changed = false;
  const nextNodesById: Record<string, Node> = {};
  Object.entries(nodesById).forEach(([nodeId, node]) => {
    const nextNode = repairInlineDocumentNode(node);
    if (nextNode !== node) changed = true;
    if (nextNode) {
      nextNodesById[nodeId] = nextNode;
    }
  });
  return changed ? nextNodesById : nodesById as Record<string, Node>;
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
  return state.activeNodeId === routedNodeId ? state : { ...state, activeNodeId: routedNodeId };
}

function resolveDemoNodeIdFromPath(pathname: string) {
  const slug = resolveGuideSlugFromPath(pathname);
  const topic = getDemoTopicsForLocale(resolveDemoLocalePathSegment(pathname)).find((candidate) => candidate.slug === slug);
  return topic ? getDemoTopicNodeId(topic) : null;
}
