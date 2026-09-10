import { recordAttachmentRetirementObligation } from '../../lib/core/sync/attachmentRetirementObligation.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';
import {
  commitDesktopAttachmentRetirement,
  prepareDesktopAttachmentRetirement,
  restoreDesktopAttachmentRetirement
} from '../attachments/attachmentRetirementJournal.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { materializeDesktopSettingRecord } from './desktopSettingMaterializer.js';
import { loadDesktopHostName } from './hostProfile.js';
import { resolveRuntimeDataPaths } from './runtimeDataPaths.js';

interface ApplySyncObjectsOptions {
  hostName?: string;
  includeAlreadyApplied?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function warnSkippedSyncObject(record: unknown, reason: unknown) {
  const raw = isRecord(record) ? record : {};
  console.warn('[sync] skipped remote state object', {
    objectId: typeof raw.object_id === 'string' ? raw.object_id : null,
    objectType: typeof raw.object_type === 'string' ? raw.object_type : null,
    reason: reason instanceof Error ? reason.message : String(reason)
  });
}

export async function applySyncObjectsAsync(records: NativeSyncObjectRecord[], options: ApplySyncObjectsOptions = {}) {
  if (records.length === 0) return [];
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-sync-object-apply' });
  const hostName = options.hostName ?? loadDesktopHostName();
  const paths = resolveRuntimeDataPaths();
  const retirement = prepareDesktopAttachmentRetirement(records, paths.assetsDir, new Map(), paths.databasePath);
  try {
    return await port.transaction(async (tx) => {
      const applied = await applySyncObjectsWithDbPort(tx, records, {
        ...options,
        ...(hostName ? { hostName } : {}),
        onPayloadAppliedInTransaction: materializeDesktopSettingRecord,
        onSkippedRecord: warnSkippedSyncObject
      });
      if (retirement) {
        const obligation = {
          items: retirement.tombstones,
          journalToken: retirement.journalToken,
          libraryScope: retirement.libraryScope
        };
        await recordAttachmentRetirementObligation(tx, obligation, 'database_committed');
        commitDesktopAttachmentRetirement(retirement, connection.driver);
        await recordAttachmentRetirementObligation(tx, obligation, 'verified');
      }
      return applied;
    });
  } catch (error) {
    restoreDesktopAttachmentRetirement(retirement);
    throw error;
  }
}
