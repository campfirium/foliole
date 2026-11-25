import type { BacklinkItem } from '../../../features/nodes/model/internalLinks';
import { getElectronAPI, type ElectronAPI, type WorkspaceContentChangedPayload } from '../electronApi';
import { loadRuntimeNodeBacklinks } from '../nodeBacklinksRuntimeRepository';
import { onWorkspaceContentChanged, onWorkspaceSyncApplied } from '../runtimeShellEvents';

export interface RuntimeBacklinksState {
  errorMessage: string;
  isLoading: boolean;
  libraryScope: string | undefined;
  targetNodeId: string | null;
  value: BacklinkItem[] | null;
}

export const EMPTY_RUNTIME_BACKLINKS_STATE: RuntimeBacklinksState = {
  errorMessage: '', isLoading: false, libraryScope: undefined, targetNodeId: null, value: null
};

type Subscriber = (state: RuntimeBacklinksState) => void;
type RequestGroup = ReturnType<typeof startBacklinksRequest>;
type BacklinkNotification = Pick<WorkspaceContentChangedPayload, 'libraryScope' | 'workspaceScope' | 'backlinkSourceChange'>;
const activeRequests = new WeakMap<ElectronAPI, Map<string, RequestGroup>>();
const requestsWithoutBridge = new Map<string, RequestGroup>();

function requestGroups() {
  const bridge = getElectronAPI();
  if (!bridge) return requestsWithoutBridge;
  let requests = activeRequests.get(bridge);
  if (!requests) {
    requests = new Map();
    activeRequests.set(bridge, requests);
  }
  return requests;
}

function backlinksMayHaveChanged(payload: BacklinkNotification, targetNodeId: string, libraryScope: string | undefined) {
  if (payload.libraryScope && libraryScope && payload.libraryScope !== libraryScope) return false;
  const scope = payload.workspaceScope;
  if (scope?.kind === 'nodes' && !scope.nodeIds.length && !scope.structure) return false;
  const source = payload.backlinkSourceChange;
  // An edit to the target's own body can never create an incoming link to itself.
  return !source || source.titleChanged || (source.nodeId !== targetNodeId && source.outgoingLinksChanged);
}

function startBacklinksRequest(targetNodeId: string, libraryScope: string | undefined) {
  let state = { ...EMPTY_RUNTIME_BACKLINKS_STATE, libraryScope, targetNodeId };
  let disposed = false;
  let inFlight = false;
  let invalidated = false;
  const subscribers = new Set<Subscriber>();
  const unlisteners: (() => void)[] = [];
  const publish = (update: Partial<RuntimeBacklinksState>) => {
    state = { ...state, ...update, targetNodeId };
    for (const subscriber of subscribers) subscriber(state);
  };
  const reload = () => {
    if (disposed) return;
    if (inFlight) {
      invalidated = true;
      return;
    }
    inFlight = true;
    publish({ errorMessage: '', isLoading: true });
    void loadRuntimeNodeBacklinks(targetNodeId).then(value => {
      if (!disposed && !invalidated) publish({ value, isLoading: false });
    }).catch(() => {
      if (!disposed && !invalidated) publish({ errorMessage: 'Backlinks could not be loaded.', isLoading: false });
    }).finally(() => {
      inFlight = false;
      if (!invalidated) return;
      invalidated = false;
      reload();
    });
  };
  const changed = (payload: BacklinkNotification) => {
    if (backlinksMayHaveChanged(payload, targetNodeId, libraryScope)) reload();
  };
  for (const subscribe of [onWorkspaceContentChanged, onWorkspaceSyncApplied]) {
    void subscribe(changed).then(unlisten => {
      if (disposed) unlisten?.();
      else if (unlisten) unlisteners.push(unlisten);
    });
  }
  reload();
  return {
    reload, subscribers, getState: () => state,
    dispose() {
      disposed = true;
      unlisteners.forEach(unlisten => unlisten());
    }
  };
}

function requestKey(targetNodeId: string, libraryScope: string | undefined) {
  return JSON.stringify([libraryScope, targetNodeId]);
}

export function subscribeRuntimeBacklinks(targetNodeId: string, libraryScope: string | undefined, subscriber: Subscriber) {
  const requests = requestGroups();
  const key = requestKey(targetNodeId, libraryScope);
  const active = requests.get(key) ?? startBacklinksRequest(targetNodeId, libraryScope);
  requests.set(key, active);
  active.subscribers.add(subscriber);
  subscriber(active.getState());
  return () => {
    active.subscribers.delete(subscriber);
    if (active.subscribers.size) return;
    active.dispose();
    requests.delete(key);
  };
}

export function refreshRuntimeBacklinks(targetNodeId: string, libraryScope: string | undefined) {
  requestGroups().get(requestKey(targetNodeId, libraryScope))?.reload();
}
