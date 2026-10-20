import { hashTextBody } from '../../lib/core/database/textBodyHash';
import type { DbPort } from '../../lib/core/sync/dbPort';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';
import type { CapacitorCompanionDatabaseManager } from '../shared/platform/companion/runtime/capacitorCompanionDatabaseOwner';
import {
  closeIosCompanionDatabase, getIosCompanionDatabaseOwner, initializeIosCompanionDatabase
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createAcceptanceScratchDatabase } from '../shared/platform/companion/runtime/requestSnapshotFixture';

export const remediationImage = `${'a'.repeat(64)}.png`;
const time = '2026-10-19T00:00:00.000Z';

export async function seedRemediationPerformanceFixture(db: DbPort) {
  for (let offset = 0; offset < 1000; offset += 50) {
    const records = Array.from({ length: 50 }, (_, index) => record(offset + index));
    await applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false });
  }
}

function record(index: number): NativeSyncNodeRecord {
  const id = `remediation-${index}`;
  const body = `![image](asset://${remediationImage})\n${'x'.repeat(4096)}`.slice(0, 4096);
  return { object_id: id, object_type: 'node', version_id: `${id}-v1`, parent_version_id: null,
    parent_version_ids: [], ancestor_version_ids: [], body_text: body, content_hash: hashTextBody(body),
    host_name: 'Remediation acceptance', updated_at: time, version_created_at: time,
    snapshot: { id, kind: 'topic', title: id, content: body, attachments: [], anchor_link: null,
      created_at: time, updated_at: time, deleted_at: null, parent_id: null, position: null,
      priority: null, desired_retention: null, is_title_manual: true, hide_title_heading: false,
      opening_text: null, virtual_filter: null, reveal: null, image_regions: null } };
}

export async function openRemediationPerformanceFixture(platform: 'android' | 'ios') {
  const scratch = await createAcceptanceScratchDatabase('remediation_performance');
  let fullReads = 0;
  const manager: CapacitorCompanionDatabaseManager = { ...scratch.manager,
    async createConnection(...args) {
      const connection = await scratch.manager.createConnection(...args);
      const query = connection.query.bind(connection);
      connection.query = async (sql, values) => {
        if (sql.includes('AS collection_source_content') && !sql.includes('selected_nodes')) fullReads++;
        return query(sql, values);
      };
      return connection;
    }
  };
  const close = async () => {
    try { await closeIosCompanionDatabase(); }
    finally { await scratch.remove(); }
  };
  try {
    await initializeIosCompanionDatabase({ booted_at: time, database_path: null, database_ready: false,
      host_name: 'Remediation acceptance', runtime_kind: platform === 'android' ? 'android-capacitor' : 'ios-capacitor' }, manager);
    const owner = getIosCompanionDatabaseOwner();
    await owner.runWriter(seedRemediationPerformanceFixture);
    return { owner, close, fullReads: () => fullReads };
  } catch (error) { await close(); throw error; }
}
