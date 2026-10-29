import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { supportsDbBatch, type DbBatchPort } from '../../../../../lib/core/sync/dbStatements';
import { createEmptyEditorOperationHistory, type EditorOperationHistoryState } from '../../../../features/editor/model/editorOperationHistory';

interface HistoryCandidate {
  history: EditorOperationHistoryState;
  transactional: boolean;
}

const candidates = new WeakMap<DbPort, () => HistoryCandidate>();
const confirmedCandidates = new WeakMap<DbPort, HistoryCandidate>();

/** One database owner's editing history, published only after its outer commit. */
export function createCompanionEditHistorySession(db: DbPort): DbPort {
  const confirmed: HistoryCandidate = { history: createEmptyEditorOperationHistory(), transactional: false };
  let active: HistoryCandidate | null = null;
  let transactionDb: DbPort | null = null;
  const port: DbPort = {
    run: (sql, params) => (transactionDb ?? db).run(sql, params),
    query: (sql, params) => (transactionDb ?? db).query(sql, params),
    async transaction(execute) {
      if (active) return (transactionDb ?? db).transaction(() => execute(port));
      const next = { history: confirmed.history, transactional: true };
      active = next;
      try {
        const result = await db.transaction(tx => {
          transactionDb = tx;
          return execute(port);
        });
        confirmed.history = next.history;
        return result;
      } finally {
        active = null;
        transactionDb = null;
      }
    }
  };
  if (supportsDbBatch(db)) (port as DbBatchPort).batch = statements => {
    const target = transactionDb ?? db;
    if (!supportsDbBatch(target)) throw new Error('database_batch_unavailable');
    return target.batch(statements);
  };
  candidates.set(port, () => active ?? confirmed);
  confirmedCandidates.set(port, confirmed);
  return port;
}

export function readCompanionSessionHistory(db: DbPort) {
  return requireCandidate(db).history;
}

export function stageCompanionSessionHistory(db: DbPort, history: EditorOperationHistoryState) {
  const candidate = requireCandidate(db);
  if (!candidate.transactional) throw new Error('editor_history_requires_transaction');
  candidate.history = history;
}

function requireCandidate(db: DbPort) {
  const candidate = candidates.get(db);
  if (!candidate) throw new Error('editor_history_requires_database_owner');
  return candidate();
}

export async function clearRetiredCompanionEditHistory(db: DbPort) {
  await db.transaction(async tx => {
    await tx.run("DELETE FROM companion_meta WHERE key = 'editor_operation_history'");
    await tx.run(`DELETE FROM node_version_local_holds
      WHERE instr(hold_id, 'editor_history:') = 1 OR instr(hold_id, 'editor_history_body:') = 1`);
  });
}

export function readConfirmedCompanionEditHistory(db: DbPort) {
  const candidate = confirmedCandidates.get(db);
  if (!candidate) throw new Error('editor_history_requires_database_owner');
  return candidate.history;
}
