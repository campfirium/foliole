import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { readReadySyncIdentityChangedPage } from '../../../../../lib/core/sync/syncIdentityChangedPage';
import { verifySyncIdentityFactProof } from '../../../../../lib/core/sync/syncIdentityFactProofSeal';
import { readReadySyncIdentityGlobalPage,
  readReadySyncIdentityInventory } from '../../../../../lib/core/sync/syncIdentityGlobalRead';
import {
  readReadySyncIdentityPage, readReadySyncIdentitySummary,
  readReadySyncIdentityWatermark
} from '../../../../../lib/core/sync/syncIdentityIndexMaintenance';
import { readSyncIdentityNodeFactGlobalPage, readSyncIdentityNodeFactInventory } from '../../../../../lib/core/sync/syncIdentityNodeFactGlobalRead';
import { readSyncIdentityNodeFactPage,
  readSyncIdentityNodeFactSummary } from '../../../../../lib/core/sync/syncIdentityNodeFactIndex';
import { readSyncIdentityNodeFactDescriptorPage,
  type SyncIdentityNodeFactSection } from '../../../../../lib/core/sync/syncIdentityNodeFactPage';

const SCHEMA = 'identity_view';

function text(value: unknown, max = 2048) {
  if (typeof value !== 'string' || !value || value.length > max) {
    throw new Error('sync_identity_request_invalid');
  }
  return value;
}

function partition(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
      value < 0 || value > 255) throw new Error('sync_identity_request_invalid');
  return value;
}

function pageAfter(payload: Record<string, unknown>) {
  if (payload.after_type == null && payload.after_id == null) return null;
  return { object_type: text(payload.after_type, 128), object_id: text(payload.after_id) };
}

function changedAfter(payload: Record<string, unknown>) {
  if (payload.after_updated_at == null && payload.after_type == null &&
      payload.after_id == null) return null;
  return { updated_at: text(payload.after_updated_at, 128),
    object_type: text(payload.after_type, 128), object_id: text(payload.after_id) };
}

/** Native hosts authenticate and select the fixed per-peer snapshot before this read. */
export async function withCompanionSyncIdentitySnapshot<T>(port: DbPort, snapshotPath: unknown,
  execute: (port: DbPort) => Promise<T>) {
  const path = text(snapshotPath, 4096);
  if (!path.includes('/cache/foliole-provider-source-') || !path.endsWith('.db')) {
    throw new Error('sync_identity_source_view_invalid');
  }
  await port.run(`ATTACH DATABASE '${path.replaceAll("'", "''")}' AS ${SCHEMA}`);
  try {
    return await execute(port);
  } finally {
    await port.run(`DETACH DATABASE ${SCHEMA}`);
  }
}

export async function readCompanionSyncIdentitySource(port: DbPort,
  payload: Record<string, unknown>) {
  return withCompanionSyncIdentitySnapshot(port, payload.snapshot_path, async () => {
    const operation = text(payload.read_kind, 32);
    if (operation === 'summary') {
      const [epoch] = await port.query<{ source_epoch: string } & DbRow>(
        `SELECT source_epoch FROM ${SCHEMA}.sync_state_sequence WHERE singleton_id = 1`);
      if (!epoch?.source_epoch) throw new Error('sync_identity_source_epoch_missing');
      return { source_epoch: epoch.source_epoch,
        watermark: await readReadySyncIdentityWatermark(port, SCHEMA),
        partitions: await readReadySyncIdentitySummary(port, SCHEMA) };
    }
    if (operation === 'global_summary') {
      const [epoch] = await port.query<{ source_epoch: string } & DbRow>(
        `SELECT source_epoch FROM ${SCHEMA}.sync_state_sequence WHERE singleton_id = 1`);
      if (!epoch?.source_epoch) throw new Error('sync_identity_source_epoch_missing');
      return { source_epoch: epoch.source_epoch,
        watermark: await readReadySyncIdentityWatermark(port, SCHEMA),
        inventory: await readReadySyncIdentityInventory(port, SCHEMA) };
    }
    if (operation === 'global_page') {
      return readReadySyncIdentityGlobalPage(port, pageAfter(payload), SCHEMA);
    }
    if (operation === 'page') {
      return readReadySyncIdentityPage(port, partition(payload.partition),
        pageAfter(payload), 128, 65536, SCHEMA);
    }
    if (operation === 'fact_global_summary') {
      return { inventory: await readSyncIdentityNodeFactInventory(port, SCHEMA),
        proof_root: await verifySyncIdentityFactProof(port, SCHEMA) };
    }
    if (operation === 'fact_global_page') {
      return readSyncIdentityNodeFactGlobalPage(port, pageAfter(payload), SCHEMA);
    }
    if (operation === 'fact_summary') {
      return { partitions: await readSyncIdentityNodeFactSummary(port, SCHEMA),
        proof_root: await verifySyncIdentityFactProof(port, SCHEMA) };
    }
    if (operation === 'fact_page') {
      const after = pageAfter(payload);
      if (after && after.object_type !== 'node') throw new Error('sync_identity_request_invalid');
      return readSyncIdentityNodeFactPage(port, partition(payload.partition),
        after?.object_id ?? null, SCHEMA);
    }
    if (operation === 'node_facts') return readNodeFacts(port, payload);
    if (operation === 'changed_page') {
      if (typeof payload.since !== 'string' || payload.since.length > 128) {
        throw new Error('sync_identity_request_invalid');
      }
      return readReadySyncIdentityChangedPage(port, payload.since,
        changedAfter(payload), 128, SCHEMA);
    }
    throw new Error('sync_identity_request_invalid');
  });
}

function readNodeFacts(port: DbPort, payload: Record<string, unknown>) {
  const section = text(payload.section, 32);
  if (!['versions', 'parents', 'reviews', 'requirements'].includes(section)) {
    throw new Error('sync_identity_node_fact_request_invalid');
  }
  return readSyncIdentityNodeFactDescriptorPage(port, {
    nodeId: text(payload.node_id), section: section as SyncIdentityNodeFactSection,
    after: payload.after == null ? null : text(payload.after, 4096), schema: SCHEMA
  });
}
