import type { NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

export const WEB_SYNC_STATE_KEY = 'foliole-companion-workspace-sync-state';

export function normalizeWorkspaceSyncState(value: unknown): NativeCompanionWorkspaceSyncState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      workspace_snapshot: null
    };
  }

  const raw = value as Record<string, unknown>;
  return {
    endpoint_url: typeof raw.endpoint_url === 'string' && raw.endpoint_url.trim() ? raw.endpoint_url.trim() : null,
    last_synced_at: typeof raw.last_synced_at === 'string' && raw.last_synced_at.trim() ? raw.last_synced_at.trim() : null,
    remembered_targets: Array.isArray(raw.remembered_targets)
      ? raw.remembered_targets.filter((target): target is string => typeof target === 'string' && target.trim().length > 0)
      : [],
    workspace_snapshot:
      raw.workspace_snapshot && typeof raw.workspace_snapshot === 'object' && !Array.isArray(raw.workspace_snapshot)
        ? (raw.workspace_snapshot as NativeCompanionWorkspaceSyncState['workspace_snapshot'])
        : null
  };
}

export function readWebSyncState() {
  if (typeof window === 'undefined') {
    return normalizeWorkspaceSyncState(null);
  }
  try {
    return normalizeWorkspaceSyncState(JSON.parse(window.localStorage.getItem(WEB_SYNC_STATE_KEY) ?? 'null'));
  } catch {
    return normalizeWorkspaceSyncState(null);
  }
}

export function writeWebSyncState(state: NativeCompanionWorkspaceSyncState) {
  if (typeof window === 'undefined') {
    return state;
  }
  window.localStorage.setItem(WEB_SYNC_STATE_KEY, JSON.stringify(state));
  return state;
}

export function appendRememberedTarget(
  rememberedTargets: NativeCompanionWorkspaceSyncState['remembered_targets'],
  endpointUrl: string | null
) {
  if (!endpointUrl) {
    return rememberedTargets;
  }
  return [endpointUrl, ...rememberedTargets.filter((target) => target !== endpointUrl)];
}

export function removeRememberedTarget(
  rememberedTargets: NativeCompanionWorkspaceSyncState['remembered_targets'],
  endpointUrl: string
) {
  return rememberedTargets.filter((target) => target !== endpointUrl);
}

export function normalizePersistedSyncState(args: {
  endpointUrl: string | null;
  lastSyncedAt: string | null;
  rememberedTargets: NativeCompanionWorkspaceSyncState['remembered_targets'];
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
  return {
    endpoint_url: args.endpointUrl,
    last_synced_at: args.lastSyncedAt,
    remembered_targets: args.rememberedTargets,
    workspace_snapshot: args.workspaceSnapshot
  } satisfies NativeCompanionWorkspaceSyncState;
}
