import type { NodeOpenState } from '../../lib/core/database/nodeOpenState';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { Node } from '../features/nodes/model/nodeTypes';

import { resolveWorkspaceBrowseRootNodeId } from './workspaceBrowseRoot';
import type {
  NodeViewState,
  ReviewSessionState,
  WorkspaceLayoutState,
  WorkspacePersistedState
} from './workspaceStore';

type UnknownRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseActiveNodeId(value: unknown, nodesById?: Record<string, Node>) {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return nodesById && nodesById[value] ? value : undefined;
}

function parseLayout(value: unknown): WorkspaceLayoutState | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  if (
    typeof value.documentMaxWidth !== 'number' ||
    typeof value.isListCollapsed !== 'boolean' ||
    typeof value.isRightSidebarCollapsed !== 'boolean' ||
    typeof value.listWidth !== 'number' ||
    typeof value.rightSidebarWidth !== 'number'
  ) {
    return undefined;
  }
  return {
    documentMaxWidth: value.documentMaxWidth,
    isListCollapsed: value.isListCollapsed,
    isRightSidebarCollapsed: value.isRightSidebarCollapsed,
    listWidth: value.listWidth,
    rightSidebarWidth: value.rightSidebarWidth
  };
}

function isPersistedNodeEntry(nodeId: string, value: unknown): value is Node {
  return isPlainRecord(value) && value.id === nodeId;
}

function parseNodesById(value: unknown): Record<string, Node> | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const nodesById: Record<string, Node> = {};
  for (const [nodeId, node] of Object.entries(value)) {
    if (isPersistedNodeEntry(nodeId, node)) {
      nodesById[nodeId] = node;
    }
  }
  return Object.keys(nodesById).length > 0 ? nodesById : undefined;
}

function isNodeViewState(value: unknown): value is NodeViewState {
  if (!isPlainRecord(value) || typeof value.scrollTop !== 'number') {
    return false;
  }
  if (value.selection !== null) {
    if (!isPlainRecord(value.selection)) {
      return false;
    }
    if (typeof value.selection.from !== 'number' || typeof value.selection.to !== 'number') {
      return false;
    }
  }
  return (
    !('updatedAt' in value) ||
    typeof value.updatedAt === 'string' ||
    value.updatedAt === null
  );
}

function parseNodeViewById(value: unknown) {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter((entry): entry is [string, NodeViewState] =>
    typeof entry[0] === 'string' && isNodeViewState(entry[1])
  );
  return Object.fromEntries(entries);
}

function parseNodeOpenStateById(value: unknown) {
  if (!isPlainRecord(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, NodeOpenState] => {
    const [nodeId, state] = entry;
    return isPlainRecord(state) && state.nodeId === nodeId &&
      typeof state.lastOpenedAt === 'string' && Number.isFinite(Date.parse(state.lastOpenedAt));
  });
  return Object.fromEntries(entries);
}

function parseStringValueRecord(value: unknown) {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string'
  );
  return Object.fromEntries(entries);
}

function parseNumberValueRecord(value: unknown) {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter((entry): entry is [string, number] =>
    typeof entry[1] === 'number'
  );
  return Object.fromEntries(entries);
}

function filterTrashIdsWithTombstones(
  trashedNodeIds: string[] | undefined,
  trashedNodeDeletedAtById: Record<string, string | undefined> | undefined
) {
  return trashedNodeIds?.filter((nodeId) => typeof trashedNodeDeletedAtById?.[nodeId] === 'string') ?? [];
}

function normalizeParsedWorkspaceSnapshot(
  parsedState: Partial<WorkspacePersistedState> & { nodesById: Record<string, Node> }
) {
  return normalizeWorkspaceSnapshot({
    activeNodeId: parsedState.activeNodeId ?? null,
    nodeOrder: parsedState.nodeOrder ?? [],
    nodesById: parsedState.nodesById,
    trashedNodeDeletedAtById: parsedState.trashedNodeDeletedAtById ?? {},
    trashedNodeIds: filterTrashIdsWithTombstones(parsedState.trashedNodeIds, parsedState.trashedNodeDeletedAtById)
  });
}

function parseReviewSession(value: unknown): ReviewSessionState | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  if (
    (value.currentNodeId !== null && typeof value.currentNodeId !== 'string') ||
    typeof value.isAnswerRevealed !== 'boolean' ||
    !isStringArray(value.queueNodeIds) ||
    typeof value.totalNodeCount !== 'number'
  ) {
    return undefined;
  }
  const nextReviewDueAt =
    typeof value.nextReviewDueAt === 'string' && Number.isFinite(Date.parse(value.nextReviewDueAt))
      ? value.nextReviewDueAt
      : value.nextReviewDueAt === null
        ? null
        : undefined;
  return {
    ...(typeof value.completedAt === 'string' || value.completedAt === null ? { completedAt: value.completedAt } : {}),
    ...(typeof value.continueNodeId === 'string' || value.continueNodeId === null ? { continueNodeId: value.continueNodeId } : {}),
    ...(typeof value.currentItemStartedAt === 'string' || value.currentItemStartedAt === null ? { currentItemStartedAt: value.currentItemStartedAt } : {}),
    currentNodeId: value.currentNodeId,
    isAnswerRevealed: value.isAnswerRevealed,
    queueNodeIds: value.queueNodeIds,
    ...(typeof value.readingElapsedMs === 'number' ? { readingElapsedMs: value.readingElapsedMs } : {}),
    ...(typeof value.readTopicCount === 'number' ? { readTopicCount: value.readTopicCount } : {}),
    ...(typeof value.reviewElapsedMs === 'number' ? { reviewElapsedMs: value.reviewElapsedMs } : {}),
    ...(typeof value.reviewedItemCount === 'number' ? { reviewedItemCount: value.reviewedItemCount } : {}),
    ...(nextReviewDueAt !== undefined ? { nextReviewDueAt } : {}),
    ...(typeof value.sessionStartedAt === 'string' || value.sessionStartedAt === null ? { sessionStartedAt: value.sessionStartedAt } : {}),
    totalNodeCount: value.totalNodeCount
  };
}

export function parsePersistedWorkspaceState(value: unknown): Partial<WorkspacePersistedState> {
  if (!isPlainRecord(value)) {
    return {};
  }

  const nodesById = parseNodesById(value.nodesById);
  const activeNodeId = parseActiveNodeId(value.activeNodeId, nodesById);
  const layout = parseLayout(value.layout);
  const nodeOpenStateById = parseNodeOpenStateById(value.nodeOpenStateById);
  const nodeViewById = parseNodeViewById(value.nodeViewById ?? value.persistedNodeViewById);
  const reviewSession = parseReviewSession(value.reviewSession);
  const rendererBoundaryKeepNodeIds = isStringArray(value.rendererBoundaryKeepNodeIds)
    ? value.rendererBoundaryKeepNodeIds
    : undefined;
  const capturedWorkspaceVersion =
    typeof value.capturedWorkspaceVersion === 'string' || value.capturedWorkspaceVersion === null
      ? value.capturedWorkspaceVersion
      : undefined;
  const trashedNodeDeletedAtById = parseStringValueRecord(value.trashedNodeDeletedAtById);
  const untitledSequenceByParent = parseNumberValueRecord(value.untitledSequenceByParent);
  const parsedState = {
    ...(nodesById ? { nodesById } : {}),
    ...(capturedWorkspaceVersion !== undefined ? { capturedWorkspaceVersion } : {}),
    ...(activeNodeId !== undefined ? { activeNodeId } : {}),
    ...(typeof value.browseRootNodeId === 'string' ? { browseRootNodeId: value.browseRootNodeId } : {}),
    ...(layout ? { layout } : {}),
    ...(nodeOpenStateById ? { nodeOpenStateById } : {}),
    ...(nodeViewById ? { nodeViewById } : {}),
    ...(isStringArray(value.nodeOrder) ? { nodeOrder: value.nodeOrder } : {}),
    ...(reviewSession ? { reviewSession } : {}),
    ...(rendererBoundaryKeepNodeIds ? { rendererBoundaryKeepNodeIds } : {}),
    ...(trashedNodeDeletedAtById ? { trashedNodeDeletedAtById } : {}),
    ...(isStringArray(value.trashedNodeIds) ? { trashedNodeIds: value.trashedNodeIds } : {}),
    ...(untitledSequenceByParent ? { untitledSequenceByParent } : {})
  };
  if (!parsedState.nodesById) {
    return parsedState;
  }
  return {
    ...parsedState,
    browseRootNodeId: resolveWorkspaceBrowseRootNodeId({
      browseRootNodeId: parsedState.browseRootNodeId,
      nodesById: parsedState.nodesById,
      trashedNodeIds: parsedState.trashedNodeIds ?? []
    }),
    ...normalizeParsedWorkspaceSnapshot({
      ...parsedState,
      nodesById: parsedState.nodesById
    })
  };
}
