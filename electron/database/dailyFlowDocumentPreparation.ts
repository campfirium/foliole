import { loadWorkspaceNodeDocument } from '../../lib/core/database/workspaceNodeDocument.js';
import type { DailyFlowSettings } from '../../lib/core/flow/dailyFlowContract.js';
import { predictDailyFlowDocument } from '../../lib/core/flow/dailyFlowPrediction.js';
import type { DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession.js';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { DocumentPreparationQueue } from '../../src/shared/lib/documents/documentPreparation.js';
import { DocumentRetentionCache } from '../../src/shared/lib/documents/documentRetentionCache.js';

import { openDatabaseConnection, registerDatabaseConnectionCleanup } from './connection.js';
import { withRequestSyncReadonlySnapshot } from './requestSyncReadonlySnapshot.js';

type Document = NonNullable<ReturnType<typeof loadWorkspaceNodeDocument>>;
type Selection = { key: string; session: DailyFlowSession; settings: DailyFlowSettings;
  persistence: DailyFlowPersistence; connection: ReturnType<typeof openDatabaseConnection>; cancel: AbortController };
type Prepared = { connection: Selection['connection']; document: Document };
const MAX_DOCUMENT_BYTES = 200 * 1024;
const cache = new DocumentRetentionCache<Prepared>(1, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_BYTES,
  value => Buffer.byteLength(JSON.stringify(value.document)));
let selection: Selection | null = null;
let preparedNodeId: string | null = null;
const preparation = new DocumentPreparationQueue(key => selection?.key !== key || selection.cancel.signal.aborted,
  async () => { if (selection) await prepare(selection); }, 1);

function clear() {
  selection?.cancel.abort();
  selection = null;
  preparation.clear();
  cache.clear();
  preparedNodeId = null;
}
registerDatabaseConnectionCleanup(clear);

export function scheduleDesktopFlowDocumentPreparation(session: DailyFlowSession, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence) {
  selection?.cancel.abort();
  preparation.clear();
  if (preparedNodeId !== session.currentNodeId) { cache.clear(); preparedNodeId = null; }
  if (!session.daily || !session.currentNodeId) { clear(); return; }
  const key = JSON.stringify(session.daily);
  selection = { key, session, settings, persistence, connection: openDatabaseConnection(), cancel: new AbortController() };
  preparation.request([key]);
}

async function prepare(source: Selection) {
  const { session, settings, persistence, connection, cancel } = source;
  const next = await withRequestSyncReadonlySnapshot(connection.dbPath, db => predictDailyFlowDocument(db,
    { token: session.daily!, currentNodeId: session.currentNodeId!, now: new Date().toISOString() }, settings, persistence), cancel.signal);
  if (!next || selection !== source || cancel.signal.aborted || openDatabaseConnection() !== connection) return;
  // External changes can invalidate the snapshot without starting another Flow action.
  const state = await withRequestSyncReadonlySnapshot(connection.dbPath, readDailyFlow, cancel.signal);
  if (!state || state.invalidated || state.revision !== session.daily!.revision || selection !== source
    || cancel.signal.aborted || openDatabaseConnection() !== connection) return;
  const document = loadWorkspaceNodeDocument(connection.driver, next);
  if (document?.currentVersionId && cache.set(next, { connection, document })) preparedNodeId = next;
}

export function consumePreparedDesktopFlowDocument(nodeId: string) {
  const prepared = cache.get(nodeId);
  if (!prepared) return null;
  cache.delete(nodeId);
  preparedNodeId = null;
  const connection = openDatabaseConnection();
  if (prepared.connection !== connection) return null;
  const row = connection.driver.queryOne<{ current_version_id: string | null; updated_at: string; deleted_at: string | null; sync_dirty: number }>(
    'SELECT current_version_id, updated_at, deleted_at, sync_dirty FROM nodes WHERE id = ?', [nodeId]);
  if (!row || row.deleted_at || row.sync_dirty || row.current_version_id !== prepared.document.currentVersionId
    || row.updated_at !== prepared.document.updatedAt) return null;
  return prepared.document;
}
