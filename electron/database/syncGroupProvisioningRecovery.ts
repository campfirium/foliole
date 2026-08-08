import fs from 'node:fs';

import { ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS } from '../../lib/core/database/androidCompanionAppDataClearMutationDefinitions.js';
import { ANDROID_COMPANION_MUTATION_DEFINITIONS } from '../../lib/core/database/androidCompanionMutationDefinitions.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import type { DatabaseConnection } from './connection.js';

interface ProvisioningRow {
  [key: string]: null | number | string;
  member_state: string;
}

export function recoverInterruptedDesktopSyncGroupProvisioning(connection: Pick<DatabaseConnection, 'driver'>) {
  const provisioning = connection.driver.queryOne<ProvisioningRow>(
    'SELECT member_state FROM sync_group_local_state WHERE singleton_id = 1'
  );
  if (provisioning?.member_state !== 'provisioning') return false;
  const attachments = connection.driver.queryAll<{ attachment_id: string }>(
    'SELECT attachment_id FROM attachment_blobs'
  );
  for (const { attachment_id: attachmentId } of attachments) {
    const filePath = resolveAttachmentStoragePath(attachmentId);
    fs.rmSync(filePath, { force: true });
    fs.rmSync(`${filePath}.partial`, { force: true });
  }
  connection.driver.transaction(() => {
    for (const mutation of ANDROID_COMPANION_APP_DATA_CLEAR_MUTATIONS) {
      const exists = connection.driver.queryOne(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?", [mutation.table]
      );
      if (!exists) continue;
      connection.driver.execute(ANDROID_COMPANION_MUTATION_DEFINITIONS[mutation.statementName]);
    }
  });
  return true;
}
