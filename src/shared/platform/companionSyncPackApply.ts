import {
  dependencyResumeUrl, loadSyncPackDependencyResume, retireSyncPackDependencyView
} from '../../../lib/core/sync/syncPackDependencyResume';
import { clearSyncPackKnownFactClaims } from '../../../lib/core/sync/syncPackKnownFactClaims';
import type { NativeSyncPackApplyResult } from '../../../lib/platform/nativeSyncContract';
import { resolveLocalSyncGroupDevice } from '../../../lib/platform/syncGroupContract';

import { createSignedRequestHeaders } from './companion/network/signedRequest';
import { getIosCompanionDatabaseOwner } from './companion/runtime/iosCompanionDatabaseBootstrap';
import { flushCompanionNodeVersionReceipts } from './companion/sync/companionNodeVersionReceiptDelivery';
import { prepareCompanionSyncPackFactRequest } from './companion/sync/pack-apply/companionSyncPackFactProbe';
import { applyIosCompanionSyncPackPath } from './companion/sync/pack-apply/iosCompanionSyncPackApply';
import { loadCompanionSyncGroup } from './companion/sync/syncGroupStore';
import { loadCompanionBootstrapState } from './companionBootstrap';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  deleteCompanionDownloadedSyncPack,
  downloadCompanionDesktopSyncPack
} from './companionSyncPackTransfer';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';

type PreparedDependencyRequest = Awaited<ReturnType<typeof prepareCompanionSyncPackFactRequest>> | {
  url: string; headers: Record<string, string>; factClaims?: undefined;
};

export async function applyCompanionDesktopSyncPack(args: {
  expectedRestoreId?: string;
  headers: Record<string, string>;
  sourceHostName?: string;
  sourcePeerId: string;
  url: string;
}): Promise<NativeSyncPackApplyResult> {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') {
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }
  if (!args.sourceHostName?.trim()) throw new Error('sync_group_source_host_unavailable');
  const bootstrap = await loadCompanionBootstrapState();
  if (!bootstrap.host_name) throw new Error('companion_host_name_missing');
  const group = await loadCompanionSyncGroup();
  const localDevice = group ? resolveLocalSyncGroupDevice(group) : null;
  if (!localDevice) throw new Error('sync_group_local_device_missing');
  const endpointUrl = new URL(args.url).origin;
  if (!args.expectedRestoreId) await flushCompanionNodeVersionReceipts(endpointUrl, args.sourcePeerId);
  const resume = await getIosCompanionDatabaseOwner().read((db) => loadSyncPackDependencyResume(db, {
    groupId: group!.group_id, peerId: args.sourcePeerId,
    fromStateSeq: Number(new URL(args.url).searchParams.get('after_state_seq') ?? '0')
  }));
  const prepared = resume ? await signDependencyRequest(dependencyResumeUrl(args.url, resume))
    : await prepareCompanionSyncPackFactRequest(args.url, { groupId: group!.group_id,
      peerId: args.sourcePeerId });
  const result = await applyDependencyRound({ args, prepared, resume,
    deviceId: localDevice.device_identity_key, groupId: group!.group_id,
    hostName: bootstrap.host_name });
  if (!args.expectedRestoreId) await flushCompanionNodeVersionReceipts(endpointUrl, args.sourcePeerId);
  return result;
}

async function applyDependencyRound(input: {
  args: Parameters<typeof applyCompanionDesktopSyncPack>[0]; prepared: PreparedDependencyRequest;
  resume: Awaited<ReturnType<typeof loadSyncPackDependencyResume>>; deviceId: string;
  groupId: string; hostName: string;
}) {
  const { args } = input;
  let { prepared, resume } = input;
  let previousPosition = resume?.nextRow ?? 0;
  let reconciled = false;
  let roundRebased = 'roundRebased' in prepared && prepared.roundRebased === true;
  for (;;) {
    let result: Awaited<ReturnType<typeof downloadAndApplyDependencyPage>>;
    try { result = await downloadAndApplyDependencyPage({ ...input, prepared }); }
    catch (error) {
      if (reconciled || !error || typeof error !== 'object' ||
          !('code' in error) || error.code !== 'sync_pack_source_view_unavailable') throw error;
      const url = new URL(prepared.url);
      if (resume && url.searchParams.get('dependency_view') === resume.transfer.sourceViewId) {
        const transfer = resume.transfer;
        await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((db) =>
          retireSyncPackDependencyView(db, transfer)));
      } else if (!resume && url.searchParams.has('fact_view')) {
        const sourceViewId = url.searchParams.get('fact_view')!;
        await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((db) =>
          clearSyncPackKnownFactClaims(db, { groupId: input.groupId,
            peerId: args.sourcePeerId, sourceViewId })));
      } else throw error;
      prepared = await prepareCompanionSyncPackFactRequest(args.url, { groupId: input.groupId,
        peerId: input.args.sourcePeerId });
      roundRebased = true;
      resume = null;
      previousPosition = 0;
      reconciled = true;
      continue;
    }
    if (!result) return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
    if (result.dependencyProgress) {
      if (result.dependencyProgress.nextRow <= previousPosition) throw new Error('sync_pack_dependency_no_progress');
      previousPosition = result.dependencyProgress.nextRow;
      resume = result.dependencyProgress;
      prepared = await signDependencyRequest(dependencyResumeUrl(prepared.url, result.dependencyProgress));
      continue;
    }
    return roundRebased ? { ...result, round_rebased: true } : result;
  }
}

async function downloadAndApplyDependencyPage(input: {
  args: Parameters<typeof applyCompanionDesktopSyncPack>[0];
  prepared: { url: string; headers: Record<string, string>;
    factClaims?: Awaited<ReturnType<typeof prepareCompanionSyncPackFactRequest>>['factClaims'] | undefined };
  deviceId: string; hostName: string;
}) {
  const { args, prepared } = input;
  const packPath = await downloadCompanionDesktopSyncPack({ ...args,
    headers: prepared.headers, url: prepared.url, expectedPeerId: input.deviceId,
    expectedSourcePeerId: args.sourcePeerId });
  if (!packPath) return null;
  try {
    return await applyIosCompanionSyncPackPath({
      deviceId: input.deviceId, hostName: input.hostName,
      ...(args.expectedRestoreId ? { expectedRestoreId: args.expectedRestoreId } : {}),
      packPath, sourceHostName: args.sourceHostName!, sourcePeerId: args.sourcePeerId,
      ...(prepared.factClaims ? { factClaims: prepared.factClaims } : {})
    });
  } finally { await deleteCompanionDownloadedSyncPack(packPath); }
}

async function signDependencyRequest(url: string) {
  const parsed = new URL(url);
  return { url, headers: await createSignedRequestHeaders({ endpointUrl: parsed.origin,
    method: 'GET', pathWithQuery: parsed.pathname + parsed.search }) };
}
