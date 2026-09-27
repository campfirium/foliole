import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

import { asString } from './commandParsers.js';

export async function handleEditorHoldCommand(command: string, args: Record<string, unknown>) {
  if (command !== NATIVE_COMMANDS.retainNodeEditorBase &&
      command !== NATIVE_COMMANDS.releaseNodeEditorBase) return undefined;
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const holdId = asString(args.holdId, 'holdId');
  const nodeId = asString(args.nodeId, 'nodeId');
  if (command === NATIVE_COMMANDS.releaseNodeEditorBase) {
    await releaseLocalEditBase(port, holdId, nodeId);
    return { released: true };
  }
  await port.transaction((tx) => retainLocalEditBase(tx, {
    holdId, nodeId, versionId: asString(args.versionId, 'versionId')
  }));
  return { retained: true };
}
