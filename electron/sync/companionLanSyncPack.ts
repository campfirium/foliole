import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openDatabaseConnection } from '../database/connection.js';
import { loadDesktopSyncGroupRestoreState } from '../database/syncGroupRestoreState.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { buildDesktopSyncPack } from '../database/syncPackBuilder.js';

export const SYNC_PACK_PATH = '/companion/sync-pack';

export interface CompanionSyncPackResource {
  body?: Buffer;
  error?: string;
  fileName?: string;
  status: 'error' | 'ready';
  statusCode: number;
}

function parseStateSeq(value: string | null) {
  if (value == null || value.trim() === '') {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function buildCompanionSyncPackResource(
  parsedRequestUrl: URL,
  authenticatedDeviceId: string
): Promise<CompanionSyncPackResource> {
  const fromStateSeq = parseStateSeq(parsedRequestUrl.searchParams.get('after_state_seq'));
  if (fromStateSeq == null) {
    return { error: 'invalid_after_state_seq', status: 'error', statusCode: 400 };
  }
  const restoreId = parsedRequestUrl.searchParams.get('restore_id');
  if (restoreId !== null && (!restoreId.trim() || fromStateSeq !== 0)) {
    return { error: 'invalid_restore_pack_request', status: 'error', statusCode: 400 };
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-'));
  const packId = randomUUID();
  const outputPath = path.join(tempRoot, `${packId}.syncpack`);
  try {
    const group = loadDesktopSyncGroup();
    const local = group?.devices.find((device) =>
      device.device_identity_key === group.local_device_identity_key && device.state === 'active');
    if (!group || !local) throw new Error('sync_group_local_device_missing');
    if (restoreId) {
      const restore = loadDesktopSyncGroupRestoreState(openDatabaseConnection().driver, group.group_id);
      if (!restore?.applied || restore.event.restore_id !== restoreId ||
          restore.event.source_device_identity_key !== local.device_identity_key) {
        return { error: 'sync_group_restore_source_unavailable', status: 'error', statusCode: 409 };
      }
    }
    await buildDesktopSyncPack({
      fromPeerId: local.device_identity_key, fromStateSeq, outputPath, packId,
      ...(restoreId ? { restoreId } : {}),
      toPeerId: authenticatedDeviceId, requireDeliveryHold: true
    });
    return {
      body: await fs.readFile(outputPath),
      fileName: `${packId}.syncpack`,
      status: 'ready',
      statusCode: 200
    };
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
}
