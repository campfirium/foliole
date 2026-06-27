interface NodeContentVersionState {
  createPending: boolean;
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
    createPending: false,
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
