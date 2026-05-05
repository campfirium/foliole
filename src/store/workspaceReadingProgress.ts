interface WorkspaceSnapshotLike {
  activeNodeId: string | null;
  nodeViewById?: Record<string, NodeViewState>;
  nodeOrder: string[];
  nodesById: Record<string, unknown>;
  trashedNodeIds: string[];
}

interface RuntimeNodeViewState {
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
}

interface RuntimeReadingProgressSnapshot {
  activeNodeId: string | null;
  nodeViewStateById: Record<string, RuntimeNodeViewState>;
}

interface NodeViewState {
  scrollTop: number;
  selection: {
    from: number;
    to: number;
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isWorkspaceSnapshotLike(value: unknown): value is WorkspaceSnapshotLike {
  if (!isObject(value)) {
    return false;
  }
  return (
    (typeof value.activeNodeId === 'string' || value.activeNodeId === null) &&
    Array.isArray(value.nodeOrder) &&
    value.nodeOrder.every((item) => typeof item === 'string') &&
    isObject(value.nodesById) &&
    Array.isArray(value.trashedNodeIds) &&
    value.trashedNodeIds.every((item) => typeof item === 'string')
  );
}

function toRuntimeReadingProgressSnapshot(value: unknown): RuntimeReadingProgressSnapshot | null {
  if (!isObject(value)) {
    return null;
  }
  const activeNodeId = value.activeNodeId;
  const nodeViewStateById = value.nodeViewStateById;
  if (activeNodeId !== null && typeof activeNodeId !== 'string') {
    return null;
  }
  if (!isObject(nodeViewStateById)) {
    return null;
  }

  const normalizedNodeViewStateById: Record<string, RuntimeNodeViewState> = {};
  for (const [nodeId, rawState] of Object.entries(nodeViewStateById)) {
    if (!isObject(rawState)) {
      continue;
    }
    const scrollTop = rawState.scrollTop;
    const selectionFrom = rawState.selectionFrom;
    const selectionTo = rawState.selectionTo;
    if (typeof scrollTop !== 'number' || !Number.isFinite(scrollTop) || scrollTop < 0) {
      continue;
    }
    if (selectionFrom !== null && typeof selectionFrom !== 'number') {
      continue;
    }
    if (selectionTo !== null && typeof selectionTo !== 'number') {
      continue;
    }
    normalizedNodeViewStateById[nodeId] = {
      scrollTop,
      selectionFrom: selectionFrom === null ? null : Math.max(0, Math.trunc(selectionFrom)),
      selectionTo: selectionTo === null ? null : Math.max(0, Math.trunc(selectionTo))
    };
  }

  return {
    activeNodeId,
    nodeViewStateById: normalizedNodeViewStateById
  };
}

function toLocalNodeViewById(nodeViewStateById: Record<string, RuntimeNodeViewState>): Record<string, NodeViewState> {
  const localNodeViewById: Record<string, NodeViewState> = {};
  for (const [nodeId, state] of Object.entries(nodeViewStateById)) {
    const selectionFrom = state.selectionFrom ?? 0;
    const selectionTo = state.selectionTo ?? selectionFrom;
    localNodeViewById[nodeId] = {
      scrollTop: Math.max(0, Math.trunc(state.scrollTop)),
      selection: {
        from: selectionFrom,
        to: selectionTo
      }
    };
  }
  return localNodeViewById;
}

export function mergeWorkspaceSnapshotWithReadingProgress(
  snapshot: unknown,
  readingProgress: unknown
): WorkspaceSnapshotLike | null {
  if (!isWorkspaceSnapshotLike(snapshot)) {
    return null;
  }

  const readingProgressSnapshot = toRuntimeReadingProgressSnapshot(readingProgress);
  if (!readingProgressSnapshot) {
    return snapshot;
  }

  const nodeViewById = toLocalNodeViewById(readingProgressSnapshot.nodeViewStateById);
  const trashedNodeIds = new Set(snapshot.trashedNodeIds);
  const canUseRuntimeActiveNode = Boolean(
    readingProgressSnapshot.activeNodeId &&
      snapshot.nodesById[readingProgressSnapshot.activeNodeId] &&
      !trashedNodeIds.has(readingProgressSnapshot.activeNodeId)
  );

  return {
    ...snapshot,
    activeNodeId: canUseRuntimeActiveNode ? readingProgressSnapshot.activeNodeId : snapshot.activeNodeId,
    nodeViewById
  };
}

export function toRuntimeNodeViewStates(nodeViewById: Record<string, NodeViewState | undefined>) {
  const nodeViewStates: Array<{
    nodeId: string;
    scrollTop: number;
    selectionFrom: number;
    selectionTo: number;
  }> = [];

  for (const [nodeId, viewState] of Object.entries(nodeViewById)) {
    if (!viewState) {
      continue;
    }
    nodeViewStates.push({
      nodeId,
      scrollTop: Math.max(0, Math.trunc(viewState.scrollTop)),
      selectionFrom: Math.max(0, Math.trunc(viewState.selection.from)),
      selectionTo: Math.max(0, Math.trunc(viewState.selection.to))
    });
  }

  return nodeViewStates;
}
