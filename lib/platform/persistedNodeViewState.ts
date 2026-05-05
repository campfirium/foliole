export type NodeViewStateWriteSource = 'user-scroll' | 'restore' | 'close-flush' | 'sync-apply';

export interface PersistedNodeViewState {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
  updatedAt: string;
  source: NodeViewStateWriteSource;
}

export type NodeViewStateRestoreMode = 'scroll-only' | 'selection';

export interface NodeViewStateRestoreTarget extends PersistedNodeViewState {
  mode: NodeViewStateRestoreMode;
}

export interface NodeViewStateWriteDecision {
  shouldWrite: boolean;
  reason:
    | 'new-row'
    | 'newer-or-equal'
    | 'local-user-tie'
    | 'older'
    | 'restore-cannot-cover-user-position'
    | 'invalid';
}

const WRITE_SOURCES = new Set<NodeViewStateWriteSource>(['user-scroll', 'restore', 'close-flush', 'sync-apply']);
const USER_POSITION_SOURCES = new Set<NodeViewStateWriteSource>(['user-scroll', 'close-flush']);

function normalizePosition(value: number) {
  return Math.max(0, Math.trunc(value));
}

function normalizeSelectionValue(value: number | null) {
  return value === null ? null : normalizePosition(value);
}

export function normalizeNodeViewStateWriteSource(value: unknown): NodeViewStateWriteSource {
  return WRITE_SOURCES.has(value as NodeViewStateWriteSource) ? (value as NodeViewStateWriteSource) : 'user-scroll';
}

export function createPersistedNodeViewState(input: {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
  updatedAt: string;
  source?: unknown;
}): PersistedNodeViewState | null {
  const nodeId = input.nodeId.trim();
  const updatedAt = input.updatedAt.trim();
  if (!nodeId || !Number.isFinite(input.scrollTop) || !updatedAt) {
    return null;
  }

  return {
    nodeId,
    scrollTop: normalizePosition(input.scrollTop),
    selectionFrom: normalizeSelectionValue(input.selectionFrom),
    selectionTo: normalizeSelectionValue(input.selectionTo),
    updatedAt,
    source: normalizeNodeViewStateWriteSource(input.source)
  };
}

export function resolveNodeViewStateRestoreTarget(
  persistedState: PersistedNodeViewState | null | undefined
): NodeViewStateRestoreTarget | null {
  if (!persistedState) {
    return null;
  }

  const hasSelection = persistedState.selectionFrom !== null && persistedState.selectionTo !== null;
  return {
    ...persistedState,
    mode: hasSelection ? 'selection' : 'scroll-only'
  };
}

export function shouldWritePersistedNodeViewState(
  existing: PersistedNodeViewState | null | undefined,
  incoming: PersistedNodeViewState | null | undefined
): NodeViewStateWriteDecision {
  if (!incoming) {
    return { shouldWrite: false, reason: 'invalid' };
  }
  if (!existing) {
    return { shouldWrite: true, reason: 'new-row' };
  }
  if (incoming.source === 'restore' && USER_POSITION_SOURCES.has(existing.source)) {
    return { shouldWrite: false, reason: 'restore-cannot-cover-user-position' };
  }

  const existingTime = Date.parse(existing.updatedAt);
  const incomingTime = Date.parse(incoming.updatedAt);
  if (!Number.isFinite(existingTime) || !Number.isFinite(incomingTime)) {
    return { shouldWrite: false, reason: 'invalid' };
  }
  if (incomingTime > existingTime) {
    return { shouldWrite: true, reason: 'newer-or-equal' };
  }
  if (incomingTime < existingTime) {
    return { shouldWrite: false, reason: 'older' };
  }
  if (USER_POSITION_SOURCES.has(incoming.source) && !USER_POSITION_SOURCES.has(existing.source)) {
    return { shouldWrite: true, reason: 'local-user-tie' };
  }
  if (existing.source === 'restore' && incoming.source === 'sync-apply') {
    return { shouldWrite: true, reason: 'newer-or-equal' };
  }
  if (existing.source === incoming.source) {
    return { shouldWrite: true, reason: 'newer-or-equal' };
  }
  return { shouldWrite: false, reason: 'older' };
}
