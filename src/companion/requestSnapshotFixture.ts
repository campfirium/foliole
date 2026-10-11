import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import { hashTextBody } from '../../lib/core/database/textBodyHash';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';
import { CapacitorCompanionDatabaseOwner, type CapacitorCompanionDatabaseManager } from '../shared/platform/companion/runtime/capacitorCompanionDatabaseOwner';
import { closeCompanionFramedPayloadBudget, configureCompanionFramedPayloadBudget } from '../shared/platform/companion/runtime/companionFramedPayloadBudget';

import { requireValue } from './capacityAcceptanceSafety';

export function snapshotProbeRecord(index: number): NativeSyncNodeRecord {
  const time = '2026-10-11T00:00:00.000Z';
  const body = `${index}:` + 'x'.repeat(128 * 1024);
  return { version_id: `snapshot-v${index}`, parent_version_id: index ? `snapshot-v${index - 1}` : null,
    parent_version_ids: index ? [`snapshot-v${index - 1}`] : [], ancestor_version_ids: [],
    object_id: 'snapshot-topic', object_type: 'node', body_text: body, content_hash: hashTextBody(body),
    host_name: 'Snapshot acceptance', updated_at: time, version_created_at: time,
    snapshot: { id: 'snapshot-topic', kind: 'topic', title: 'Snapshot acceptance', content: body,
      attachments: [], anchor_link: null, created_at: time, updated_at: time, deleted_at: null,
      parent_id: null, position: null, priority: null, desired_retention: null, is_title_manual: true,
      hide_title_heading: false, opening_text: null, virtual_filter: null, reveal: null, image_regions: null } };
}

export async function openRequestSnapshotFixture(platform: 'android' | 'ios') {
  const name = `request_snapshot_${crypto.randomUUID().replaceAll('-', '')}`;
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  requireValue((await sqlite.isDatabase(name)).result === false, 'Scratch database absence unverified');
  const manager: CapacitorCompanionDatabaseManager = {
    createConnection: (_name, encrypted, mode, version, readonly) => sqlite.createConnection(name, encrypted, mode, version, readonly),
    closeConnection: (_name, readonly) => sqlite.closeConnection(name, readonly),
    isConnection: (_name, readonly) => sqlite.isConnection(name, readonly),
    isDatabase: () => sqlite.isDatabase(name),
    retrieveConnection: (_name, readonly) => sqlite.retrieveConnection(name, readonly)
  };
  const owner = new CapacitorCompanionDatabaseOwner(manager, platform);
  const close = async () => {
    try { await closeCompanionFramedPayloadBudget(owner); }
    finally {
      await owner.close();
      await sqlite.createConnection(name, false, 'no-encryption', 1, false);
      try { await CapacitorSQLite.deleteDatabase({ database: name, readonly: false }); }
      finally { await sqlite.closeConnection(name, false); }
      requireValue((await sqlite.isDatabase(name)).result === false, 'Scratch database cleanup failed');
    }
  };
  try {
    await owner.open({ allowCreate: true, now: new Date().toISOString(), expectedHostName: 'Snapshot acceptance' });
    await configureCompanionFramedPayloadBudget(owner);
    await owner.runWriter(db => applySyncNodesWithDbPort(db, Array.from({ length: 48 }, (_, index) => snapshotProbeRecord(index)), { enqueueSearchInvalidations: false }));
    return { owner, close, name };
  } catch (error) { await close(); throw error; }
}
