import type { NativeCompanionSyncEvent, NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

import {
  loadIosCompanionWorkspaceSyncState,
  saveIosCompanionWorkspaceSyncState
} from './companion/sync/workspace-state/iosCompanionWorkspaceSyncStateStore';
import { resolveReadableCompanionArticle } from './companionReadableArticle';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  clearCompanionPairingCredentials,
  discoverCompanionDesktop,
  discoverCompanionDesktops,
  loadCompanionDiscovery,
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
} from './companionWorkspacePairing';
import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime,
  normalizeEndpointUrl
} from './companionWorkspaceRuntimeRepository';
import { normalizeReadableArticlePayload } from './companionWorkspaceSyncPayloads';
import {
  appendRememberedTarget,
  type CompanionSyncOnboardingStatus,
  normalizePersistedSyncState,
  normalizeWorkspaceSyncState,
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
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    return loadIosCompanionWorkspaceSyncState();
  }
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebSyncState();
  }
  return normalizeWorkspaceSyncState(await FolioleCompanionSync.loadWorkspaceSyncState());
}

export {
  discoverCompanionDesktop,
  discoverCompanionDesktops,
  clearCompanionPairingCredentials,
  loadCompanionDiscovery,
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
};
export {
  loadCompanionWorkspaceVersion,
  resolveReachableCompanionWorkspaceSyncEndpoint
} from './companion/network/companionWorkspaceEndpoint';

export async function saveCompanionWorkspaceSyncEndpoint(endpointUrl: string) {
  const normalizedEndpointUrl = endpointUrl.trim() ? normalizeEndpointUrl(endpointUrl) : null;
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    return updateIosWorkspaceSyncState((current) => ({
      ...current,
      endpoint_url: normalizedEndpointUrl,
      remembered_targets: appendRememberedTarget(current.remembered_targets, normalizedEndpointUrl)
    }));
  }
  if (!isNativeAndroidCompanionRuntime()) {
    const current = readWebSyncState();
    return writeWebSyncState({
      ...current,
      endpoint_url: normalizedEndpointUrl,
      remembered_targets: appendRememberedTarget(current.remembered_targets, normalizedEndpointUrl)
    });
  }
  return runCompanionSyncWriterTask(async () => (
    normalizeWorkspaceSyncState(
      await FolioleCompanionSync.saveWorkspaceSyncEndpoint({ endpoint_url: normalizedEndpointUrl })
    )
  ));
}

export async function removeCompanionWorkspaceSyncRememberedTarget(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    return updateIosWorkspaceSyncState((current) => {
      const remembered = removeRememberedTarget(current.remembered_targets, normalizedEndpointUrl);
      return {
        ...current,
        endpoint_url: current.endpoint_url === normalizedEndpointUrl ? remembered[0] ?? null : current.endpoint_url,
        remembered_targets: remembered
      };
    });
  }
  if (!isNativeAndroidCompanionRuntime()) {
    const current = readWebSyncState();
    const nextRememberedTargets = removeRememberedTarget(current.remembered_targets, normalizedEndpointUrl);
    return writeWebSyncState({
      ...current,
      endpoint_url: current.endpoint_url === normalizedEndpointUrl ? nextRememberedTargets[0] ?? null : current.endpoint_url,
      remembered_targets: nextRememberedTargets
    });
  }
  return runCompanionSyncWriterTask(async () => (
    normalizeWorkspaceSyncState(
      await FolioleCompanionSync.removeWorkspaceSyncRememberedTarget({ endpoint_url: normalizedEndpointUrl })
    )
  ));
}

export async function saveCompanionSyncOnboardingStatus(status: CompanionSyncOnboardingStatus) {
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    return updateIosWorkspaceSyncState((current) => ({ ...current, sync_onboarding_status: status }));
  }
  if (!isNativeAndroidCompanionRuntime()) {
    const current = readWebSyncState();
    return writeWebSyncState({
      ...current,
      sync_onboarding_status: status
    });
  }
  return runCompanionSyncWriterTask(async () => (
    normalizeWorkspaceSyncState(await FolioleCompanionSync.saveSyncOnboardingStatus({ status }))
  ));
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
    ...(args.summary !== undefined ? { summary: args.summary } : {})
  };
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    return updateIosWorkspaceSyncState((current) => prependSyncEvent(current, event));
  }
  if (!isNativeAndroidCompanionRuntime()) {
    const current = readWebSyncState();
    return writeWebSyncState(prependSyncEvent(current, event));
  }
  return runCompanionSyncWriterTask(async () => (
    normalizeWorkspaceSyncState(await FolioleCompanionSync.recordWorkspaceSyncEvent(event))
  ));
}

export async function loadCompanionReadableArticle(snapshot?: NativeCompanionWorkspaceSyncState['workspace_snapshot']) {
  if (snapshot) {
    return resolveReadableCompanionArticle(snapshot);
  }
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    return resolveReadableCompanionArticle((await loadIosCompanionWorkspaceSyncState()).workspace_snapshot);
  }
  if (!isNativeAndroidCompanionRuntime()) {
    return resolveReadableCompanionArticle(readWebSyncState().workspace_snapshot);
  }
  return normalizeReadableArticlePayload(await FolioleCompanionSync.loadReadableArticle());
}

export async function persistCompanionWorkspaceSnapshot(args: {
  changedNodeId?: string;
  endpointUrl: string | null;
  lastSyncedAt: string | null;
  rememberedTargets: NativeCompanionWorkspaceSyncState['remembered_targets'];
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
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
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebSyncState(nextState);
  }

  return loadCompanionWorkspaceSyncState();
}
