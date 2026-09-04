import { useCallback, useEffect, useRef, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import { publishCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import { startCompanionSyncGroupDiscoverySession } from '../shared/platform/companion/syncGroupDiscoverySession';
import {
  cancelCompanionSyncGroupJoin,
  completeCompanionSyncGroupJoin,
  requestCompanionSyncGroupJoin
} from '../shared/platform/companionSyncGroupJoinClient';

import type {
  CompanionSyncGroupDiscovery,
  PendingSyncGroupJoinRequest
} from './companionSyncGroupJoinModel';

export type CompanionSyncGroupJoinStatus = 'idle' | 'discovering' | 'requesting' | 'awaiting-acceptance';

interface SyncGroupJoinArgs {
  bootstrapState: NativeCompanionBootstrapState;
  onError(message: string | null): void;
  onSaveEndpoint(endpointUrl: string): Promise<unknown>;
}

function mapCandidates(snapshot: Parameters<Parameters<typeof startCompanionSyncGroupDiscoverySession>[0]>[0]) {
  return snapshot.candidates.map((candidate): CompanionSyncGroupDiscovery => ({
    appVersion: '',
    compatibility: { missing_capabilities: [], negotiated_version: null, reason: null, status: 'compatible' },
    endpointUrl: candidate.endpoint_url,
    groupDisplayName: candidate.group_display_name,
    groupId: candidate.group_id,
    groupTag: candidate.group_tag,
    providerDeviceId: candidate.provider_device_id,
    providerDeviceName: candidate.provider_device_name,
    providerPlatform: candidate.provider_platform
  }));
}

function pendingFromCandidate(
  result: Awaited<ReturnType<typeof requestCompanionSyncGroupJoin>>,
  candidate: CompanionSyncGroupDiscovery
): PendingSyncGroupJoinRequest {
  return { endpointUrl: result.endpoint_url, expiresAt: result.expires_at,
    groupId: result.group_id, providerDeviceId: candidate.providerDeviceId,
    providerDeviceName: candidate.providerDeviceName,
    providerPlatform: candidate.providerPlatform, requestId: result.request_id };
}

function useJoinCompletion(args: {
  config: SyncGroupJoinArgs;
  pendingRequest: PendingSyncGroupJoinRequest | null;
  setJoined(value: boolean): void;
  setPendingRequest(value: PendingSyncGroupJoinRequest | null): void;
  setStatus(value: CompanionSyncGroupJoinStatus): void;
}) {
  const completionRef = useRef<Promise<unknown> | null>(null);
  return useCallback(async (request = args.pendingRequest) => {
    if (!request || !args.config.bootstrapState.database_path) return null;
    completionRef.current ??= completeCompanionSyncGroupJoin({
      databasePath: args.config.bootstrapState.database_path,
      endpointUrl: request.endpointUrl,
      providerDeviceId: request.providerDeviceId,
      providerDeviceName: request.providerDeviceName,
      providerPlatform: request.providerPlatform,
      requestId: request.requestId
    }).then((group) => {
      args.setPendingRequest(null); args.setStatus('idle'); args.config.onError(null);
      args.setJoined(true);
      publishCompanionSyncMutationRevision();
      return group;
    }).finally(() => { completionRef.current = null; });
    return completionRef.current;
  }, [args]);
}

function useJoinCancellation(args: {
  config: SyncGroupJoinArgs;
  pendingRequest: PendingSyncGroupJoinRequest | null;
  pendingRequestRef: React.MutableRefObject<PendingSyncGroupJoinRequest | null>;
  setPendingRequest(value: PendingSyncGroupJoinRequest | null): void;
  setStatus(value: CompanionSyncGroupJoinStatus): void;
}) {
  return useCallback(() => {
    if (args.pendingRequest) cancelCompanionSyncGroupJoin(args.pendingRequest.requestId);
    args.pendingRequestRef.current = null;
    args.setPendingRequest(null); args.setStatus('idle'); args.config.onError(null);
  }, [args]);
}

function usePersistedJoinState(databasePath: string | null, setJoined: (value: boolean) => void) {
  useEffect(() => {
    void Promise.resolve().then(() => loadCompanionSyncGroup())
      .then((group) => setJoined(Boolean(group))).catch(() => setJoined(false));
  }, [databasePath, setJoined]);
}

function useJoinAcceptancePolling(
  pendingRequest: PendingSyncGroupJoinRequest | null,
  complete: (request?: PendingSyncGroupJoinRequest | null) => Promise<unknown>
) {
  useEffect(() => {
    if (!pendingRequest) return;
    let active = true;
    let timer: number | null = null;
    const poll = async () => {
      if (!active || Date.now() >= new Date(pendingRequest.expiresAt).getTime()) return;
      try { await complete(pendingRequest); }
      catch { if (active) timer = window.setTimeout(poll, 1_000); }
    };
    timer = window.setTimeout(poll, 250);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [complete, pendingRequest]);
}

export function useCompanionSyncGroupJoin(args: SyncGroupJoinArgs) {
  const [discoveries, setDiscoveries] = useState<CompanionSyncGroupDiscovery[]>([]);
  const [pendingRequest, setPendingRequest] = useState<PendingSyncGroupJoinRequest | null>(null);
  const [status, setStatus] = useState<CompanionSyncGroupJoinStatus>('idle');
  const [joined, setJoined] = useState(false);
  const pendingRequestRef = useRef<PendingSyncGroupJoinRequest | null>(null);
  const stopRef = useRef<null | (() => Promise<void>)>(null);
  const complete = useJoinCompletion({
    config: args, pendingRequest, setJoined, setPendingRequest, setStatus
  });
  const cancel = useJoinCancellation({
    config: args, pendingRequest, pendingRequestRef, setPendingRequest, setStatus
  });

  const stopDiscovery = useCallback(async () => {
    const stop = stopRef.current;
    stopRef.current = null;
    await stop?.();
  }, []);

  const discover = useCallback(async () => {
    await stopDiscovery();
    setStatus('discovering'); args.onError(null);
    stopRef.current = await startCompanionSyncGroupDiscoverySession((snapshot) => {
      setDiscoveries(mapCandidates(snapshot));
      if (snapshot.status === 'permission_required' || snapshot.status === 'unavailable'
        || snapshot.status === 'incompatible' || snapshot.status === 'connection_failed') {
        args.onError(`discovery_${snapshot.status}`); setStatus('idle');
      }
      const pending = pendingRequestRef.current;
      if (pending && snapshot.candidates.some((candidate) =>
        candidate.group_id === pending.groupId)) void complete(pending).catch(() => undefined);
    });
  }, [args, complete, stopDiscovery]);

  const request = useCallback(async (endpointUrl: string) => {
    if (!args.bootstrapState.database_path) throw new Error('companion_database_unavailable');
    const candidate = discoveries.find((value) => value.endpointUrl === endpointUrl);
    if (!candidate) throw new Error('sync_group_discovery_candidate_missing');
    setStatus('requesting'); args.onError(null);
    try {
      const result = await requestCompanionSyncGroupJoin({
        databasePath: args.bootstrapState.database_path,
        endpointUrl: candidate.endpointUrl,
        groupId: candidate.groupId
      });
      const next = pendingFromCandidate(result, candidate);
      pendingRequestRef.current = next;
      setPendingRequest(next); setStatus('awaiting-acceptance');
      await args.onSaveEndpoint(result.endpoint_url);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus('idle'); args.onError(message);
      throw error;
    }
  }, [args, discoveries]);

  useEffect(() => () => { void stopRef.current?.(); }, []);
  useEffect(() => { pendingRequestRef.current = pendingRequest; }, [pendingRequest]);
  usePersistedJoinState(args.bootstrapState.database_path, setJoined);
  useJoinAcceptancePolling(pendingRequest, complete);
  return { cancel, complete, discoveries, discover, joined, pendingRequest, request, status };
}
