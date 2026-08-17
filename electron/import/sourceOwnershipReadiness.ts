import type { DatabaseRow } from '../../lib/core/database/driver.js';
import {
  evaluateSourceOwnershipReadiness,
  type SourceOwnershipMemberFact
} from '../../lib/core/sync/sourceOwnershipReadiness.js';
import { openDatabaseConnection } from '../database/connection.js';
import { recordLocalSyncGroupFeatures } from '../database/syncGroupMemberFeatures.js';

interface LocalStateRow extends DatabaseRow {
  local_device_id: string;
  member_state: string;
}

export function loadSourceOwnershipReadiness() {
  const driver = openDatabaseConnection().driver;
  const local = driver.queryOne<LocalStateRow>(
    'SELECT local_device_id, member_state FROM sync_group_local_state WHERE singleton_id = 1 LIMIT 1'
  );
  if (!local) return evaluateSourceOwnershipReadiness({ localMemberState: null, members: [] });
  recordLocalSyncGroupFeatures(driver, local.local_device_id);
  const members = driver.queryAll<SourceOwnershipMemberFact & DatabaseRow>(
    `SELECT device_id, device_kind, state, authorization_id, joined_at, advertised_features_json
     FROM sync_group_members WHERE state = 'active' ORDER BY joined_at, device_id`
  );
  return evaluateSourceOwnershipReadiness({ localMemberState: local.member_state, members });
}
