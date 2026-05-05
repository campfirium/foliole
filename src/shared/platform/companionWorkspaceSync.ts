import type {
  CompanionWorkspaceSnapshotPayload,
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
  WORKSPACE_SNAPSHOT_PATH,
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
  if (!isNativeAndroidCompanionRuntime()) {
    return resolveReadableCompanionArticle(snapshot ?? readWebSyncState().workspace_snapshot);
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

export async function pullCompanionWorkspaceSnapshot(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  const currentState = isNativeAndroidCompanionRuntime() ? null : readWebSyncState();
  const response = await fetch(`${normalizedEndpointUrl}${WORKSPACE_SNAPSHOT_PATH}`, {
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery: WORKSPACE_SNAPSHOT_PATH })
  });
  if (!response.ok) {
    throw new Error(`Desktop sync source returned ${response.status}.`);
  }
  const payload = (await response.json()) as CompanionWorkspaceSnapshotPayload;
  const lastSyncedAt =
    typeof payload.exported_at === 'string' && payload.exported_at.trim() ? payload.exported_at : new Date().toISOString();
  const nextState: NativeCompanionWorkspaceSyncState = {
    endpoint_url: normalizedEndpointUrl,
    last_synced_at: lastSyncedAt,
    remembered_targets: appendRememberedTarget(currentState?.remembered_targets ?? [], normalizedEndpointUrl),
    sync_events: currentState?.sync_events ?? [],
    sync_onboarding_status: 'completed',
    workspace_snapshot: payload.workspace_snapshot ?? null
  };

  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebSyncState(nextState);
  }

  return normalizeWorkspaceSyncState(
    await FolioleCompanionSync.replaceWorkspaceSnapshot({
      endpoint_url: normalizedEndpointUrl,
      last_synced_at: lastSyncedAt,
      workspace_snapshot_json: JSON.stringify(payload.workspace_snapshot ?? null)
    })
  );
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

  const endpointUrl = args.endpointUrl?.trim() ? normalizeEndpointUrl(args.endpointUrl) : 'local://companion';
  const lastSyncedAt = args.lastSyncedAt?.trim() ? args.lastSyncedAt : new Date().toISOString();
  const changedNode =
    args.changedNodeId && args.workspaceSnapshot ? args.workspaceSnapshot.nodesById[args.changedNodeId] : null;
  if (args.changedNodeId && changedNode) {
    return normalizeWorkspaceSyncState(
      await FolioleCompanionSync.replaceWorkspaceNode({
        endpoint_url: endpointUrl,
        last_synced_at: lastSyncedAt,
        node_id: args.changedNodeId,
        node_snapshot_json: JSON.stringify(changedNode)
      })
    );
  }
  return normalizeWorkspaceSyncState(
    await FolioleCompanionSync.replaceWorkspaceSnapshot({
      endpoint_url: endpointUrl,
      last_synced_at: lastSyncedAt,
      workspace_snapshot_json: JSON.stringify(args.workspaceSnapshot ?? null)
    })
  );
}
