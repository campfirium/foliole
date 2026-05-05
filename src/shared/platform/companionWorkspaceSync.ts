import type {
  CompanionWorkspaceVersionPayload,
  NativeCompanionWorkspaceSyncState
} from '../../../lib/platform/nativeCompanionSyncContract';

import { resolveReadableCompanionArticle } from './companionReadableArticle';
import {
  createSignedRequestHeaders,
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
  normalizeEndpointUrl,
  WORKSPACE_VERSION_PATH
} from './companionWorkspaceSyncBridge';
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

export async function loadCompanionWorkspaceSyncState() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebSyncState();
  }
  return normalizeWorkspaceSyncState(await FolioleCompanionSync.loadWorkspaceSyncState());
}

export {
  discoverCompanionDesktop,
  discoverCompanionDesktops,
  loadCompanionDiscovery,
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
};

export async function saveCompanionWorkspaceSyncEndpoint(endpointUrl: string) {
  const normalizedEndpointUrl = endpointUrl.trim() ? normalizeEndpointUrl(endpointUrl) : null;
  if (!isNativeAndroidCompanionRuntime()) {
    const current = readWebSyncState();
    return writeWebSyncState({
      ...current,
      endpoint_url: normalizedEndpointUrl,
      remembered_targets: appendRememberedTarget(current.remembered_targets, normalizedEndpointUrl)
    });
  }
  return normalizeWorkspaceSyncState(
    await FolioleCompanionSync.saveWorkspaceSyncEndpoint({ endpoint_url: normalizedEndpointUrl })
  );
}

export async function removeCompanionWorkspaceSyncRememberedTarget(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  if (!isNativeAndroidCompanionRuntime()) {
    const current = readWebSyncState();
    const nextRememberedTargets = removeRememberedTarget(current.remembered_targets, normalizedEndpointUrl);
    return writeWebSyncState({
      ...current,
      endpoint_url: current.endpoint_url === normalizedEndpointUrl ? nextRememberedTargets[0] ?? null : current.endpoint_url,
      remembered_targets: nextRememberedTargets
    });
  }
  return normalizeWorkspaceSyncState(
    await FolioleCompanionSync.removeWorkspaceSyncRememberedTarget({ endpoint_url: normalizedEndpointUrl })
  );
}

export async function saveCompanionSyncOnboardingStatus(status: CompanionSyncOnboardingStatus) {
  if (!isNativeAndroidCompanionRuntime()) {
    const current = readWebSyncState();
    return writeWebSyncState({
      ...current,
      sync_onboarding_status: status
    });
  }
  return normalizeWorkspaceSyncState(await FolioleCompanionSync.saveSyncOnboardingStatus({ status }));
}

export async function recordCompanionWorkspaceSyncEvent(args: {
  endpointUrl: string | null;
  message: string;
  occurredAt?: string;
  status: 'completed' | 'failed' | 'skipped' | 'started';
}) {
  const occurredAt = args.occurredAt ?? new Date().toISOString();
  if (!isNativeAndroidCompanionRuntime()) {
    const current = readWebSyncState();
    return writeWebSyncState(prependSyncEvent(current, {
      endpoint_url: args.endpointUrl,
      message: args.message,
      occurred_at: occurredAt,
      status: args.status
    }));
  }
  return normalizeWorkspaceSyncState(await FolioleCompanionSync.recordWorkspaceSyncEvent({
    endpoint_url: args.endpointUrl,
    message: args.message,
    occurred_at: occurredAt,
    status: args.status
  }));
}

export async function loadCompanionReadableArticle(snapshot?: NativeCompanionWorkspaceSyncState['workspace_snapshot']) {
  if (snapshot) {
    return resolveReadableCompanionArticle(snapshot);
  }
  if (!isNativeAndroidCompanionRuntime()) {
    return resolveReadableCompanionArticle(readWebSyncState().workspace_snapshot);
  }
  return normalizeReadableArticlePayload(await FolioleCompanionSync.loadReadableArticle());
}

export async function loadCompanionWorkspaceVersion(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  const response = await fetch(`${normalizedEndpointUrl}${WORKSPACE_VERSION_PATH}`, {
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery: WORKSPACE_VERSION_PATH })
  });
  if (!response.ok) {
    throw new Error(`Desktop sync source returned ${response.status}.`);
  }
  return (await response.json()) as CompanionWorkspaceVersionPayload;
}

export async function persistCompanionWorkspaceSnapshot(args: {
  changedNodeId?: string;
  endpointUrl: string | null;
  lastSyncedAt: string | null;
  rememberedTargets: NativeCompanionWorkspaceSyncState['remembered_targets'];
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
  const nextState = normalizePersistedSyncState({
    ...args,
    syncEvents: readWebSyncState().sync_events
  });
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebSyncState(nextState);
  }

  return loadCompanionWorkspaceSyncState();
}
