import type { NativeCompanionSyncEvent, NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

import {
  compactSyncEvents,
  isSyncEventConfirmedProgress
} from './companionSyncActivityEvents';

export const WEB_SYNC_STATE_KEY = 'foliole-companion-workspace-sync-state';

export type CompanionSyncOnboardingStatus = NativeCompanionWorkspaceSyncState['sync_onboarding_status'];

function normalizeSyncOnboardingStatus(raw: Record<string, unknown>): CompanionSyncOnboardingStatus {
  if (
    raw.sync_onboarding_status === 'accepted' ||
    raw.sync_onboarding_status === 'completed' ||
    raw.sync_onboarding_status === 'dismissed' ||
    raw.sync_onboarding_status === 'pending'
  ) {
    return raw.sync_onboarding_status;
  }
  if (raw.workspace_snapshot || raw.last_synced_at) {
    return 'completed';
  }
  return 'pending';
}


function normalizeSyncEvent(value: unknown): NativeCompanionSyncEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const status = raw.status;
  if (status !== 'completed' && status !== 'failed' && status !== 'skipped' && status !== 'started') {
    return null;
  }
  const occurredAt = typeof raw.occurred_at === 'string' && raw.occurred_at.trim() ? raw.occurred_at.trim() : null;
  if (!occurredAt) {
    return null;
  }
  return {
    endpoint_url: typeof raw.endpoint_url === 'string' && raw.endpoint_url.trim() ? raw.endpoint_url.trim() : null,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `${status}:${occurredAt}`,
    kind: normalizeSyncEventKind(raw.kind),
    message: typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : status,
    occurred_at: occurredAt,
    result: normalizeSyncEventResult(raw.result),
    run_id: typeof raw.run_id === 'string' && raw.run_id.trim() ? raw.run_id.trim() : undefined,
    started_at: typeof raw.started_at === 'string' && raw.started_at.trim() ? raw.started_at.trim() : undefined,
    status
  };
}

function normalizeSyncEventKind(value: unknown): NativeCompanionSyncEvent['kind'] {
  return value === 'diagnostic' ||
    value === 'legacy_event' ||
    value === 'run_finished' ||
    value === 'run_started' ||
    value === 'stage_finished'
    ? value
    : undefined;
}

function normalizeSyncEventResult(value: unknown): NativeCompanionSyncEvent['result'] {
  return value === 'blocked' || value === 'cancelled' || value === 'completed' || value === 'failed' || value === 'partial'
    ? value
    : undefined;
}

function normalizeSyncEvents(raw: Record<string, unknown>) {
  if (!Array.isArray(raw.sync_events)) {
    return [];
  }
  return raw.sync_events.map(normalizeSyncEvent).filter((event): event is NativeCompanionSyncEvent => event !== null);
}

function resolveLastSyncedAt(raw: Record<string, unknown>, syncEvents: NativeCompanionSyncEvent[]) {
  if (typeof raw.last_synced_at === 'string' && raw.last_synced_at.trim()) {
    return raw.last_synced_at.trim();
  }
  return syncEvents.find(isSyncCheckRecorded)?.occurred_at ?? null;
}

function isSyncCheckRecorded(event: NativeCompanionSyncEvent) {
  return isSyncEventConfirmedProgress(event);
}

export function prependSyncEvent(
  state: NativeCompanionWorkspaceSyncState,
  event: Omit<NativeCompanionSyncEvent, 'id'> & { id?: string }
): NativeCompanionWorkspaceSyncState {
  const id = event.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${event.status}:${event.occurred_at}`);
  const nextEvent = { ...event, id };
  return {
    ...state,
    last_synced_at: isSyncCheckRecorded(nextEvent) ? nextEvent.occurred_at : state.last_synced_at,
    sync_events: compactSyncEvents([nextEvent, ...state.sync_events])
  };
}

export function normalizeWorkspaceSyncState(value: unknown): NativeCompanionWorkspaceSyncState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'pending',
      workspace_snapshot: null
    };
  }

  const raw = value as Record<string, unknown>;
  const syncEvents = normalizeSyncEvents(raw);
  return {
    endpoint_url: typeof raw.endpoint_url === 'string' && raw.endpoint_url.trim() ? raw.endpoint_url.trim() : null,
    last_synced_at: resolveLastSyncedAt(raw, syncEvents),
    remembered_targets: Array.isArray(raw.remembered_targets)
      ? raw.remembered_targets.filter((target): target is string => typeof target === 'string' && target.trim().length > 0)
      : [],
    sync_events: syncEvents,
    sync_onboarding_status: normalizeSyncOnboardingStatus(raw),
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
  syncEvents?: NativeCompanionWorkspaceSyncState['sync_events'];
  syncOnboardingStatus?: CompanionSyncOnboardingStatus;
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
  return {
    endpoint_url: args.endpointUrl,
    last_synced_at: args.lastSyncedAt,
    remembered_targets: args.rememberedTargets,
    sync_events: args.syncEvents ?? [],
    sync_onboarding_status: args.syncOnboardingStatus ?? (args.workspaceSnapshot ? 'completed' : 'accepted'),
    workspace_snapshot: args.workspaceSnapshot
  } satisfies NativeCompanionWorkspaceSyncState;
}
