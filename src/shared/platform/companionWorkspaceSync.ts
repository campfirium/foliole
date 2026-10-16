import type { NativeCompanionSyncEvent, NativeCompanionWorkspaceSyncState } from '../../../lib/platform/nativeCompanionSyncContract';

import { readCompanionArticle } from './companion/reading/companionArticleRead';
import {
  loadIosCompanionWorkspaceSyncState,
  updateIosCompanionWorkspaceSyncMetadata,
  type CompanionSyncMetadata
} from './companion/sync/workspace-state/iosCompanionWorkspaceSyncStateStore';
import {
  resolveReadableCompanionArticle,
  resolveReadableCompanionArticleByNodeId
} from './companionReadableArticle';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  cancelCompanionSyncGroupJoin,
  completeCompanionSyncGroupJoin,
  requestCompanionSyncGroupJoin
} from './companionSyncGroupJoinClient';
import {
  discoverCompanionDesktop,
  discoverCompanionDesktops
} from './companionWorkspaceDiscovery';
import { normalizeEndpointUrl } from './companionWorkspaceRuntimeRepository';
import {
  appendRememberedTarget,
  type CompanionSyncOnboardingStatus,
  prependSyncEvent,
  readWebSyncState,
  removeRememberedTarget,
  writeWebSyncState
} from './companionWorkspaceSyncState';

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

export async function saveCompanionWorkspaceSyncEndpoint(endpointUrl: string): Promise<CompanionSyncMetadata> {
  const normalizedEndpointUrl = endpointUrl.trim() ? normalizeEndpointUrl(endpointUrl) : null;
  if (usesSharedOwner()) {
    return updateIosCompanionWorkspaceSyncMetadata((current) => ({
      endpoint_url: normalizedEndpointUrl,
      remembered_targets: appendRememberedTarget(current.remembered_targets, normalizedEndpointUrl)
    }));
  }
  const current = readWebSyncState();
  return metadataFromState(writeWebSyncState({
    ...current,
    endpoint_url: normalizedEndpointUrl,
    remembered_targets: appendRememberedTarget(current.remembered_targets, normalizedEndpointUrl)
  }));
}

export async function removeCompanionWorkspaceSyncRememberedTarget(endpointUrl: string): Promise<CompanionSyncMetadata> {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  if (usesSharedOwner()) {
    return updateIosCompanionWorkspaceSyncMetadata((current) => {
      const remembered = removeRememberedTarget(current.remembered_targets, normalizedEndpointUrl);
      return {
        endpoint_url: current.endpoint_url === normalizedEndpointUrl ? remembered[0] ?? null : current.endpoint_url,
        remembered_targets: remembered
      };
    });
  }
  const current = readWebSyncState();
  const nextRememberedTargets = removeRememberedTarget(current.remembered_targets, normalizedEndpointUrl);
  return metadataFromState(writeWebSyncState({
    ...current,
    endpoint_url: current.endpoint_url === normalizedEndpointUrl ? nextRememberedTargets[0] ?? null : current.endpoint_url,
    remembered_targets: nextRememberedTargets
  }));
}

export async function saveCompanionSyncOnboardingStatus(status: CompanionSyncOnboardingStatus): Promise<CompanionSyncMetadata> {
  if (usesSharedOwner()) {
    return updateIosCompanionWorkspaceSyncMetadata(() => ({ sync_onboarding_status: status }));
  }
  const current = readWebSyncState();
  return metadataFromState(writeWebSyncState({ ...current, sync_onboarding_status: status }));
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
}): Promise<CompanionSyncMetadata> {
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
    return updateIosCompanionWorkspaceSyncMetadata((current) => ({ sync_events: prependSyncEvent({ ...current, workspace_snapshot: null }, event).sync_events }));
  }
  const current = readWebSyncState();
  return metadataFromState(writeWebSyncState(prependSyncEvent(current, event)));
}

export async function loadCompanionReadableArticle(
  snapshot?: NativeCompanionWorkspaceSyncState['workspace_snapshot'],
  nodeId?: string | null,
  isCurrent: () => boolean = () => true
) {
  if (usesSharedOwner()) {
    const currentSnapshot = snapshot ?? (await loadIosCompanionWorkspaceSyncState()).workspace_snapshot;
    const targetNodeId = nodeId ?? currentSnapshot?.activeNodeId ?? currentSnapshot?.nodeOrder.find((id) => {
      const node = currentSnapshot.nodesById[id];
      return Boolean(node?.hasContent || node?.bodyStatus === 'empty' || node?.bodyStatus === 'missing');
    }) ?? null;
    if (!targetNodeId || !currentSnapshot) return null;
    return readCompanionArticle(currentSnapshot, targetNodeId, isCurrent);
  }
  const currentSnapshot = snapshot ?? readWebSyncState().workspace_snapshot;
  return nodeId
    ? resolveReadableCompanionArticleByNodeId(currentSnapshot, nodeId)
    : resolveReadableCompanionArticle(currentSnapshot);
}

function usesSharedOwner() {
  const kind = getCompanionRuntimeCapability().kind;
  return kind === 'android-native' || kind === 'ios-native';
}

function metadataFromState(state: NativeCompanionWorkspaceSyncState): CompanionSyncMetadata {
  return { endpoint_url: state.endpoint_url, last_synced_at: state.last_synced_at,
    remembered_targets: state.remembered_targets, sync_events: state.sync_events,
    sync_onboarding_status: state.sync_onboarding_status };
}
