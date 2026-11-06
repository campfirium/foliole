import { beginContentEditingSession } from '../../lib/core/sync/contentEditingSession.js';
import { settleContentEditingSession } from '../../lib/core/sync/settleContentEditingSession.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

import { asString } from './commandParsers.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export async function handleContentEditingSession(args: Record<string, unknown>) {
  const libraryScope = asString(args.libraryScope, 'libraryScope');
  const nodeId = asString(args.nodeId, 'nodeId');
  const sessionId = asString(args.sessionId, 'sessionId');
  if (!libraryScope || !nodeId || !sessionId) throw new Error('invalid_content_editing_scope');
  if (args.action !== 'begin' && args.action !== 'end') throw new Error('invalid_content_editing_action');
  if (libraryScope !== currentLibraryScope()) return { changed: false };
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  if (args.action === 'begin') {
    await port.transaction(tx => {
      beginContentEditingSession(tx, nodeId, sessionId);
      return Promise.resolve();
    });
    return { changed: true };
  }
  const changed = await settleContentEditingSession(port, nodeId, sessionId);
  if (changed) notifyWorkspaceContentChanged(null, { libraryScope, workspaceScope: { kind: 'nodes', nodeIds: [nodeId] } });
  return { changed };
}
