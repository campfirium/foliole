import Database from 'better-sqlite3';
import { afterEach } from 'vitest';

import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from '../../lib/core/database/syncPackProgressSchemaStatements.js';
import { createAttachmentReceiveCheckpoint } from '../../lib/core/sync/attachmentReceiveCheckpoint.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { receiveDesktopAttachmentRanges } from './desktopAttachmentRangeTransfer.js';

const databases = new Map<string, Database.Database>();
afterEach(() => { for (const database of databases.values()) database.close(); databases.clear(); });

export function checkpointForTest(filePath: string, hash: string) {
  let database = databases.get(filePath);
  if (!database) {
    database = new Database(':memory:');
    database.exec(SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS[3]);
    databases.set(filePath, database);
  }
  return createAttachmentReceiveCheckpoint(createBetterSqliteDbPort(database), filePath, hash);
}

export function receiveAttachmentForTest(
  args: Omit<Parameters<typeof receiveDesktopAttachmentRanges>[0], 'checkpoint'>
) {
  return receiveDesktopAttachmentRanges({ ...args,
    checkpoint: checkpointForTest(args.filePath, args.contentHash) });
}
