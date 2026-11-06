interface NodeContentVersionState {
  refreshAfterPersist: (() => void) | null;
  createPending: boolean;
  revealVersion: number;
  dirtyRevealVersion: number | null;
  currentVersion: number;
  dirtyVersion: number | null;
  lastPersistedVersion: number;
}

const nodeContentVersions = new Map<string, NodeContentVersionState>();
const nodeCreateConfirmWaiters = new Map<string, Set<() => void>>();

function getOrCreateNodeContentVersionState(nodeId: string) {
  const existing = nodeContentVersions.get(nodeId);
  if (existing) return existing;
  const created = {
    refreshAfterPersist: null as (() => void) | null,
    createPending: false,
    revealVersion: 0,
    dirtyRevealVersion: null,
    currentVersion: 0,
    dirtyVersion: null,
    lastPersistedVersion: 0
  };
  nodeContentVersions.set(nodeId, created);
  return created;
}

export function markNodeContentEdited(nodeId: string) {
  const state = getOrCreateNodeContentVersionState(nodeId);
  state.currentVersion += 1;
  state.dirtyVersion = state.currentVersion;
  return state.currentVersion;
}

export function markNodeContentPersisted(nodeId: string, version: number) {
  const state = getOrCreateNodeContentVersionState(nodeId);
  state.lastPersistedVersion = Math.max(state.lastPersistedVersion, version);
  if (state.dirtyVersion !== null && state.dirtyVersion <= state.lastPersistedVersion) {
    state.dirtyVersion = null;
  }
  if (state.dirtyVersion === null) {
    const refresh = state.refreshAfterPersist;
    state.refreshAfterPersist = null;
    refresh?.();
  }
}

/** A remote projection deferred for a draft still needs reconciliation after its save. */
export function deferNodeContentRefreshUntilPersisted(nodeId: string, refresh: () => void) {
  const state = getOrCreateNodeContentVersionState(nodeId);
  if (state.dirtyVersion === null) refresh();
  else state.refreshAfterPersist = refresh;
}

export function markNodeCreatePending(nodeId: string) {
  getOrCreateNodeContentVersionState(nodeId).createPending = true;
}

export function markNodeCreateConfirmed(nodeId: string) {
  const state = nodeContentVersions.get(nodeId);
  if (state) {
    state.createPending = false;
  }
  const waiters = nodeCreateConfirmWaiters.get(nodeId);
  if (waiters) {
    nodeCreateConfirmWaiters.delete(nodeId);
    waiters.forEach((resolve) => resolve());
  }
}

export function isNodeCreatePending(nodeId: string) {
  return nodeContentVersions.get(nodeId)?.createPending === true;
}

function waitForNodeCreateConfirmation(nodeId: string) {
  if (!isNodeCreatePending(nodeId)) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const waiters = nodeCreateConfirmWaiters.get(nodeId) ?? new Set<() => void>();
    waiters.add(resolve);
    nodeCreateConfirmWaiters.set(nodeId, waiters);
  });
}

export function waitForNodeCreateConfirmations(nodeIds: string[]) {
  return Promise.all([...new Set(nodeIds)].map(waitForNodeCreateConfirmation));
}

export function shouldKeepLocalNodeContent(args: {
  currentUpdatedAt: string;
  incomingUpdatedAt: string;
  nodeId: string;
}) {
  const state = nodeContentVersions.get(args.nodeId);
  if (args.incomingUpdatedAt <= args.currentUpdatedAt) {
    return true;
  }
  return Boolean(
    state
    && state.dirtyVersion !== null
    && state.dirtyVersion > state.lastPersistedVersion
  );
}

export function resetNodeContentVersionGuardForTests() {
  for (const waiters of nodeCreateConfirmWaiters.values()) {
    waiters.forEach((resolve) => resolve());
  }
  nodeCreateConfirmWaiters.clear();
  nodeContentVersions.clear();
}

export function isLatestNodeContentVersion(nodeId: string, version: number) {
  return (nodeContentVersions.get(nodeId)?.currentVersion ?? 0) <= version;
}

export function hasUnconfirmedNodeContent(nodeId: string) {
  return nodeContentVersions.get(nodeId)?.dirtyVersion != null;
}

export function markNodeRevealEdited(nodeId: string) {
  const state = getOrCreateNodeContentVersionState(nodeId);
  state.revealVersion += 1;
  state.dirtyRevealVersion = state.revealVersion;
  return state.revealVersion;
}

export function isLatestNodeRevealVersion(nodeId: string, version: number) {
  return (nodeContentVersions.get(nodeId)?.revealVersion ?? 0) <= version;
}

export function markNodeRevealPersisted(nodeId: string, version: number) {
  const state = getOrCreateNodeContentVersionState(nodeId);
  if (state.dirtyRevealVersion !== null && state.dirtyRevealVersion <= version) state.dirtyRevealVersion = null;
}

export function hasUnconfirmedNodeReveal(nodeId: string) {
  return nodeContentVersions.get(nodeId)?.dirtyRevealVersion != null;
}
