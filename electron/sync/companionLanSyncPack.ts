import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { decodeSyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { SYNC_PACK_PAGE_CONTRACT } from '../../lib/core/sync/syncPackPageContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadDesktopSyncGroupRestoreState } from '../database/syncGroupRestoreState.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { buildDesktopSyncPack, buildDesktopSyncPackPage } from '../database/syncPackBuilder.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { loadCompanionSyncPackFactIndex } from './companionLanSyncPackFacts.js';

export const SYNC_PACK_PATH = '/companion/sync-pack';

export interface CompanionSyncPackResource {
  cleanup?: () => Promise<void>;
  error?: string;
  filePath?: string;
  fileName?: string;
  status: 'error' | 'ready';
  statusCode: number;
}

function parseStateSeq(value: string | null) {
  if (value == null) return 0;
  const parsed = Number(value);
  return /^\d+$/u.test(value) && Number.isSafeInteger(parsed) ? parsed : null;
}

function resolveRequestedFactClaims(url: URL) {
  const factIndexId = url.searchParams.get('fact_index_id');
  if (!factIndexId) return null;
  const index = loadCompanionSyncPackFactIndex(url);
  if (index.index_id !== factIndexId) {
    throw new Error('sync_pack_fact_index_changed');
  }
  return { index, receiverFacts: decodeSyncPackFactClaims(index, {
    versions: url.searchParams.get('have_v') ?? '',
    parents: url.searchParams.get('have_p') ?? '',
    reviews: url.searchParams.get('have_r') ?? ''
  }) };
}

function localSyncPackSource() {
  const group = loadDesktopSyncGroup();
  const local = group?.devices.find((device) =>
    device.device_identity_key === group.local_device_identity_key && device.state === 'active');
  if (!group || !local) throw new Error('sync_group_local_device_missing');
  return { group, local };
}

async function createTempPackResource() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-'));
  const packId = randomUUID();
  return { tempRoot, packId, outputPath: path.join(tempRoot, `${packId}.syncpack`) };
}

export async function buildCompanionSyncPackResource(
  parsedRequestUrl: URL,
  authenticatedDeviceId: string
): Promise<CompanionSyncPackResource> {
  if (parsedRequestUrl.searchParams.get('page_contract') !== SYNC_PACK_PAGE_CONTRACT) {
    return { error: 'sync_pack_page_contract_required', status: 'error', statusCode: 409 };
  }
  const fromStateSeq = parseStateSeq(parsedRequestUrl.searchParams.get('after_state_seq'));
  if (fromStateSeq == null) {
    return { error: 'invalid_after_state_seq', status: 'error', statusCode: 400 };
  }
  const requestedFrontier = parsedRequestUrl.searchParams.get('frontier_state_seq');
  const frontierStateSeq = requestedFrontier === null ? undefined : parseStateSeq(requestedFrontier);
  const sourceEpoch = parsedRequestUrl.searchParams.get('source_epoch');
  if ((requestedFrontier !== null && (frontierStateSeq === null || frontierStateSeq! < fromStateSeq)) ||
      (sourceEpoch !== null && (!sourceEpoch.trim() || frontierStateSeq === undefined))) {
    return { error: 'invalid_sync_pack_page_request', status: 'error', statusCode: 400 };
  }
  const restoreId = parsedRequestUrl.searchParams.get('restore_id');
  if (restoreId !== null && (!restoreId.trim() ||
      (fromStateSeq !== 0 && (frontierStateSeq === undefined || !sourceEpoch)))) {
    return { error: 'invalid_restore_pack_request', status: 'error', statusCode: 400 };
  }
  const { group, local } = localSyncPackSource();
  if (restoreId && !isRestoreSourceAvailable(group.group_id,
    local.device_identity_key, restoreId)) {
    return { error: 'sync_group_restore_source_unavailable', status: 'error', statusCode: 409 };
  }
  const requestedFacts = resolveRequestedFactClaims(parsedRequestUrl);
  const { tempRoot, packId, outputPath } = await createTempPackResource();
  try {
    const buildInput = {
      fromPeerId: local.device_identity_key, fromStateSeq, outputPath, packId,
      ...(frontierStateSeq == null ? {} : { frontierStateSeq }),
      ...(sourceEpoch ? { sourceEpoch } : {}),
      ...(restoreId ? { restoreId } : {}),
      toPeerId: authenticatedDeviceId, requireDeliveryHold: true
    };
    if (requestedFacts) {
      const { index, receiverFacts } = requestedFacts;
      await buildDesktopSyncPack({ ...buildInput,
        frontierStateSeq: index.frontier_state_seq, sourceEpoch: index.source_epoch,
        toStateSeq: index.to_state_seq, pageBudget: DEFAULT_SYNC_PACK_PAGE_BUDGET,
        receiverFacts });
    } else {
      await buildDesktopSyncPackPage(buildInput, DEFAULT_SYNC_PACK_PAGE_BUDGET);
    }
    return {
      cleanup: () => fs.rm(tempRoot, { force: true, recursive: true }),
      filePath: outputPath,
      fileName: `${packId}.syncpack`,
      status: 'ready',
      statusCode: 200
    };
  } catch (error) {
    await fs.rm(tempRoot, { force: true, recursive: true });
    throw error;
  }
}

function isRestoreSourceAvailable(groupId: string, sourcePeerId: string, restoreId: string) {
  const restore = loadDesktopSyncGroupRestoreState(openDatabaseConnection().driver, groupId);
  return Boolean(restore?.applied && restore.event.restore_id === restoreId &&
    restore.event.source_device_identity_key === sourcePeerId);
}
