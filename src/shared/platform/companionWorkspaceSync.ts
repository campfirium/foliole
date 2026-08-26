import type { NativeCompanionSyncEvent, NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

import {
  loadIosCompanionWorkspaceSyncState,
  saveIosCompanionWorkspaceSyncState
} from './companion/sync/workspace-state/iosCompanionWorkspaceSyncStateStore';
import { resolveReadableCompanionArticle } from './companionReadableArticle';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  cancelCompanionSyncGroupJoin,
  completeCompanionSyncGroupJoin,
  requestCompanionSyncGroupJoin
} from './companionSyncGroupJoinClient';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  discoverCompanionDesktop,
  discoverCompanionDesktops
} from './companionWorkspaceDiscovery';
import { normalizeEndpointUrl } from './companionWorkspaceRuntimeRepository';
import {
  appendRememberedTarget,
  type CompanionSyncOnboardingStatus,
  normalizePersistedSyncState,
  prependSyncEvent,
  readWebSyncState,
  removeRememberedTarget,
  writeWebSyncState
} from './companionWorkspaceSyncState';

function updateIosWorkspaceSyncState(
  update: (current: NativeCompanionWorkspaceSyncState) => NativeCompanionWorkspaceSyncState
) {
  return runCompanionSyncWriterTask(async () => {
    const current = await loadIosCompanionWorkspaceSyncState();
    return saveIosCompanionWorkspaceSyncState(update(current));
  });
}

export async function loadCompanionWorkspaceSyncState() {
  if (usesSharedOwner()) {
    return loadIosCompanionWorkspaceSyncState();
  }
  return readWebSyncState();
}

export {
  discoverCompanionDesktop,
  discoverCompanionDesktops,
  cancelCompanionSyncGroupJoin,
  completeCompanionSyncGroupJoin,
  requestCompanionSyncGroupJoin
};
export {
  bindCompanionWorkspaceSyncTarget,
  loadCompanionWorkspaceVersion,
  resolveReachableCompanionWorkspaceSyncEndpoint,
  resolveReachableCompanionWorkspaceSyncEndpoints
} from './companion/network/companionWorkspaceEndpoint';

export async function saveCompanionWorkspaceSyncEndpoint(endpointUrl: string) {
  const normalizedEndpointUrl = endpointUrl.trim() ? normalizeEndpointUrl(endpointUrl) : null;
  if (usesSharedOwner()) {
    return updateIosWorkspaceSyncState((current) => ({
      ...current,
      endpoint_url: normalizedEndpointUrl,
      remembered_targets: appendRememberedTarget(current.remembered_targets, normalizedEndpointUrl)
    }));
  }
  const current = readWebSyncState();
  return writeWebSyncState({
    ...current,
    endpoint_url: normalizedEndpointUrl,
    remembered_targets: appendRememberedTarget(current.remembered_targets, normalizedEndpointUrl)
  });
}

export async function removeCompanionWorkspaceSyncRememberedTarget(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  if (usesSharedOwner()) {
    return updateIosWorkspaceSyncState((current) => {
      const remembered = removeRememberedTarget(current.remembered_targets, normalizedEndpointUrl);
      return {
        ...current,
        endpoint_url: current.endpoint_url === normalizedEndpointUrl ? remembered[0] ?? null : current.endpoint_url,
        remembered_targets: remembered
      };
    });
  }
  const current = readWebSyncState();
  const nextRememberedTargets = removeRememberedTarget(current.remembered_targets, normalizedEndpointUrl);
  return writeWebSyncState({
    ...current,
    endpoint_url: current.endpoint_url === normalizedEndpointUrl ? nextRememberedTargets[0] ?? null : current.endpoint_url,
    remembered_targets: nextRememberedTargets
  });
}

export async function saveCompanionSyncOnboardingStatus(status: CompanionSyncOnboardingStatus) {
  if (usesSharedOwner()) {
    return updateIosWorkspaceSyncState((current) => ({ ...current, sync_onboarding_status: status }));
  }
  const current = readWebSyncState();
  return writeWebSyncState({ ...current, sync_onboarding_status: status });
}

export async function recordCompanionWorkspaceSyncEvent(args: {
  endpointUrl: string | null;
  kind?: NativeCompanionSyncEvent['kind'];
  message: string;
  occurredAt?: string;
  result?: NativeCompanionSyncEvent['result'];
  runId?: string;
  startedAt?: string;
  status: 'completed' | 'failed' | 'skipped' | 'started';
  summary?: NativeCompanionSyncEvent['summary'];
  triggerReason?: NativeCompanionSyncEvent['trigger_reason'];
}) {
  const occurredAt = args.occurredAt ?? new Date().toISOString();
  const event = {
    endpoint_url: args.endpointUrl,
    ...(args.kind !== undefined ? { kind: args.kind } : {}),
    message: args.message,
    occurred_at: occurredAt,
    ...(args.result !== undefined ? { result: args.result } : {}),
    ...(args.runId !== undefined ? { run_id: args.runId } : {}),
    ...(args.startedAt !== undefined ? { started_at: args.startedAt } : {}),
    status: args.status,
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...(args.triggerReason !== undefined ? { trigger_reason: args.triggerReason } : {})
  };
  if (usesSharedOwner()) {
    return updateIosWorkspaceSyncState((current) => prependSyncEvent(current, event));
  }
  const current = readWebSyncState();
  return writeWebSyncState(prependSyncEvent(current, event));
}

export async function loadCompanionReadableArticle(snapshot?: NativeCompanionWorkspaceSyncState['workspace_snapshot']) {
  if (snapshot) {
    return resolveReadableCompanionArticle(snapshot);
  }
  if (usesSharedOwner()) {
    return resolveReadableCompanionArticle((await loadIosCompanionWorkspaceSyncState()).workspace_snapshot);
  }
  return resolveReadableCompanionArticle(readWebSyncState().workspace_snapshot);
}

export async function persistCompanionWorkspaceSnapshot(args: {
  changedNodeId?: string;
  endpointUrl: string | null;
  lastSyncedAt: string | null;
  rememberedTargets: NativeCompanionWorkspaceSyncState['remembered_targets'];
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
  if (usesSharedOwner()) {
    return updateIosWorkspaceSyncState((current) => normalizePersistedSyncState({
      ...args,
      syncEvents: current.sync_events,
      syncOnboardingStatus: current.sync_onboarding_status
    }));
  }
  const nextState = normalizePersistedSyncState({
    ...args,
    syncEvents: readWebSyncState().sync_events
  });
  return writeWebSyncState(nextState);
}

function usesSharedOwner() {
  const kind = getCompanionRuntimeCapability().kind;
  return kind === 'android-native' || kind === 'ios-native';
}
