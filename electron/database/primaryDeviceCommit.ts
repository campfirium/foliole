import type { DatabaseRow } from '../../lib/core/database/driver.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';

interface PrimaryDeviceCommitRow extends DatabaseRow {
  peer_id: string;
  primary_committed_at: string;
  primary_device_epoch: number;
  primary_updated_by_device_id: string;
}

export interface PrimaryDeviceCommit {
  committedAt: string;
  primaryDeviceEpoch: number;
  primaryDeviceId: string;
  updatedByDeviceId: string;
}

function normalizeCommit(row: PrimaryDeviceCommitRow): PrimaryDeviceCommit {
  return {
    committedAt: row.primary_committed_at,
    primaryDeviceEpoch: row.primary_device_epoch,
    primaryDeviceId: row.peer_id,
    updatedByDeviceId: row.primary_updated_by_device_id
  };
}

export function loadCommittedPrimaryDevice() {
  const row = openDatabaseConnection().driver.queryOne<PrimaryDeviceCommitRow>(
    `SELECT
       peer_id,
       primary_device_epoch,
       primary_committed_at,
       primary_updated_by_device_id
     FROM sync_peers
     WHERE primary_device_epoch IS NOT NULL
       AND primary_committed_at IS NOT NULL
       AND primary_updated_by_device_id IS NOT NULL
     ORDER BY primary_device_epoch DESC, primary_committed_at DESC, peer_id ASC
     LIMIT 1`,
    []
  );
  return row ? normalizeCommit(row) : null;
}

export function commitPrimaryDeviceToPeer(args: {
  primaryDeviceId: string;
  updatedAt?: string;
  updatedByDeviceId?: string;
}) {
  const primaryDeviceId = args.primaryDeviceId.trim();
  if (!primaryDeviceId) {
    throw new Error('primaryDeviceId is required.');
  }
  const updatedAt = args.updatedAt ?? new Date().toISOString();
  const updatedByDeviceId = args.updatedByDeviceId?.trim() || loadOrCreateDesktopDeviceId(updatedAt);
  const driver = openDatabaseConnection().driver;
  return driver.transaction(() => {
    const current = loadCommittedPrimaryDevice();
    const nextEpoch = (current?.primaryDeviceEpoch ?? 0) + (current?.primaryDeviceId === primaryDeviceId ? 0 : 1);
    driver.execute(
      `INSERT INTO sync_peers (
         peer_id,
         status,
         primary_device_epoch,
         primary_committed_at,
         primary_updated_by_device_id,
         updated_at
       ) VALUES (?, 'paired', ?, ?, ?, ?)
       ON CONFLICT(peer_id) DO UPDATE SET
         status = 'paired',
         primary_device_epoch = excluded.primary_device_epoch,
         primary_committed_at = excluded.primary_committed_at,
         primary_updated_by_device_id = excluded.primary_updated_by_device_id,
         updated_at = excluded.updated_at`,
      [primaryDeviceId, nextEpoch, updatedAt, updatedByDeviceId, updatedAt]
    );
    return {
      committedAt: updatedAt,
      primaryDeviceEpoch: nextEpoch,
      primaryDeviceId,
      updatedByDeviceId
    } satisfies PrimaryDeviceCommit;
  });
}
