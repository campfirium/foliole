import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;
export interface BrowserWorkspaceCandidate {
  before: WorkspaceState;
  get(): WorkspaceState;
  set: Set;
  storageGet(): WorkspaceState;
  storageSet: Set;
  publish(): void;
  afterPublish(action: () => void): void;
}

// Candidates exist only for a single user action, and are never exposed to subscribers.
export function createBrowserWorkspaceCandidate(get: () => WorkspaceState, set: Set): BrowserWorkspaceCandidate {
  const before = get();
  let candidate = { ...before, nodesById: { ...before.nodesById } };
  let durableNodes = candidate.nodesById;
  const afterPublish: (() => void)[] = [];
  return {
    before,
    afterPublish: action => afterPublish.push(action),
    get: () => candidate,
    storageGet: () => ({ ...candidate, nodesById: durableNodes }),
    storageSet: partial => {
      const patch = typeof partial === 'function' ? partial({ ...candidate, nodesById: durableNodes }) : partial;
      const { nodesById, ...rest } = patch;
      if (nodesById) durableNodes = nodesById;
      candidate = { ...candidate, ...rest };
    },
    set: patch => { candidate = { ...candidate, ...(typeof patch === 'function' ? patch(candidate) : patch) }; },
    publish() {
      candidate = { ...candidate, nodesById: mergeCandidateNodes(before.nodesById, durableNodes, candidate.nodesById) };
      const current = get();
      const patch: Partial<WorkspaceState> = {};
      for (const field of Object.keys(candidate) as (keyof WorkspaceState)[]) {
        if (field === 'nodesById' || candidate[field] === before[field]) continue;
        if (current[field] !== before[field]) throw new Error('browser_workspace_changed');
        Object.assign(patch, { [field]: candidate[field] });
      }
      const nodesById = mergeCandidateNodes(before.nodesById, candidate.nodesById, current.nodesById);
      if (nodesById !== current.nodesById) patch.nodesById = nodesById;
      if (Object.keys(patch).length) set(patch);
      for (const action of afterPublish) action();
    }
  };
}

function mergeCandidateNodes(before: WorkspaceState['nodesById'], candidate: WorkspaceState['nodesById'],
  current: WorkspaceState['nodesById']) {
  const merged = { ...current };
  let changed = false;
  for (const id of new Set([...Object.keys(before), ...Object.keys(candidate)])) {
    if (candidate[id] === before[id]) continue;
    changed = true;
    const source = before[id];
    const target = candidate[id];
    const actual = current[id];
    if (source && target && actual) {
      const node = { ...actual };
      for (const field of Object.keys(target) as (keyof typeof target)[]) {
        if (target[field] === source[field]) continue;
        if (actual[field] !== source[field] && JSON.stringify(actual[field]) !== JSON.stringify(target[field])) throw new Error('browser_workspace_changed');
        Object.assign(node, { [field]: target[field] });
      }
      merged[id] = node;
    } else {
      if (actual !== source) throw new Error('browser_workspace_changed');
      if (target) merged[id] = target;
      else delete merged[id];
    }
  }
  return changed ? merged : current;
}
