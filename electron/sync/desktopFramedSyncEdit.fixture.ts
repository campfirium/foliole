import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

/** Drive ordinary editor operations against the disposable process database. */
export async function runDesktopFramedSyncEditCommand(action: string, args: Readonly<Record<string, unknown>>) {
  const db = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const nodeId = requiredString(args, 'nodeId');
  if (action === 'retain_edit') return retainLocalEditBase(db, {
    nodeId, holdId: requiredString(args, 'holdId'), versionId: requiredString(args, 'versionId')
  });
  if (action === 'release_edit') return releaseLocalEditBase(db, requiredString(args, 'holdId'), nodeId);
  return applyLocalContentEdit(db, {
    nodeId, baseVersionId: requiredString(args, 'baseVersionId'), versionId: requiredString(args, 'versionId'),
    content: requiredString(args, 'content'), title: 'Concurrent article', hideTitleHeading: false,
    hostName: requiredString(args, 'hostName'), updatedAt: requiredString(args, 'updatedAt')
  });
}

function requiredString(args: Readonly<Record<string, unknown>>, key: string) {
  const value = args[key];
  if (typeof value !== 'string') throw new Error(`fixture_edit_${key}_invalid`);
  return value;
}
