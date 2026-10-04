import { restoreSavedParentOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { readParentOrderVersionPage } from '../../lib/core/sync/syncParentOrderVersionStore.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { parentOrderHistoryArgsSchema, restoreParentOrderArgsSchema } from '../../lib/platform/nativeParentOrderContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';

import { completeWorkspaceMutation, type OriginWindow } from './storageNodeMutationResult.js';

export async function handleParentOrderCommand(command: string,
  args: Record<string, unknown>, originWindow: OriginWindow) {
  if (command === NATIVE_COMMANDS.readParentOrderHistory) {
    const input = parentOrderHistoryArgsSchema.parse(args);
    const connection = openDatabaseConnection();
    const history = await readParentOrderVersionPage(createBetterSqliteDbPort(connection.sqlite),
      input.parentId, input.afterVersionId, input.limit);
    const head = connection.driver.queryOne<{ version_id: string }>(
      'SELECT version_id FROM parent_order_heads WHERE parent_id = ?', [input.parentId]);
    return { ...history, currentVersionId: head?.version_id ?? null };
  }
  if (command === NATIVE_COMMANDS.restoreParentOrderSnapshot) {
    const input = restoreParentOrderArgsSchema.parse(args);
    const changed = restoreSavedParentOrder(openDatabaseConnection().driver, {
      ...input, hostName: loadOrCreateDesktopHostName(), updatedAt: new Date().toISOString()
    });
    return changed ? completeWorkspaceMutation({ changed }, originWindow) : { changed };
  }
  return undefined;
}
