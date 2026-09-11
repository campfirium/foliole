import type { ReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type {
  ReadwiseApiIndexScope,
  ReadwiseApiScopeLedger
} from '../import/readwiseApiCandidateTypes.js';
import {
  createReadwiseApiIndexPlan,
  readwiseApiScopePolicySignature
} from '../import/readwiseApiIndexPlan.js';

import { openDatabaseConnection } from './connection.js';

const LEDGER_KIND = 'candidate-scope-v3';

export function loadOrCreateReadwiseApiScopeLedgers(
  connectionRef: string,
  policy: ReadwiseAutoImportPolicy,
  runStartedAt: string
) {
  const plan = createReadwiseApiIndexPlan(policy);
  deleteInactiveScopes(connectionRef, new Set(plan));
  return plan.map((scope) => {
    const signature = readwiseApiScopePolicySignature(scope, policy);
    const current = loadScope(connectionRef, scope);
    if (current?.policySignature === signature) {
      if (current.runStartedAt === runStartedAt) return current;
      return saveScope(connectionRef, { ...current, cursor: null, runStartedAt, status: 'running' });
    }
    return saveScope(connectionRef, {
      checkpoint: null,
      cursor: null,
      policySignature: signature,
      runStartedAt,
      scope,
      status: 'running'
    });
  });
}

function deleteInactiveScopes(connectionRef: string, active: ReadonlySet<ReadwiseApiIndexScope>) {
  const driver = openDatabaseConnection().driver;
  for (const ledger of loadReadwiseApiScopeLedgers(connectionRef)) {
    if (active.has(ledger.scope)) continue;
    driver.execute(
      `DELETE FROM readwise_api_import_stage
       WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
      [connectionRef, LEDGER_KIND, ledger.scope]
    );
  }
}

export function saveReadwiseApiScopeCursor(
  connectionRef: string,
  ledger: ReadwiseApiScopeLedger,
  cursor: string | null
) {
  return saveScope(connectionRef, { ...ledger, cursor, status: cursor ? 'running' : 'complete' });
}

export function finalizeReadwiseApiScopeLedgers(connectionRef: string) {
  const driver = openDatabaseConnection().driver;
  const ledgers = driver.queryAll<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ?`,
    [connectionRef, LEDGER_KIND]
  ).flatMap((row) => parse(row.payload_json));
  driver.transaction((tx) => {
    const update = tx.prepare(
      `UPDATE readwise_api_import_stage SET payload_json = ?
       WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`
    );
    for (const ledger of ledgers) {
      if (ledger.status !== 'complete') throw new Error(`readwise_api_scope_incomplete:${ledger.scope}`);
      update.run([JSON.stringify({
        ...ledger,
        checkpoint: ledger.runStartedAt,
        cursor: null
      }), connectionRef, LEDGER_KIND, ledger.scope]);
    }
  });
}

export function loadReadwiseApiScopeLedgers(connectionRef: string) {
  return openDatabaseConnection().driver.queryAll<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ?`,
    [connectionRef, LEDGER_KIND]
  ).flatMap((row) => parse(row.payload_json)).sort((left, right) => left.scope.localeCompare(right.scope));
}

export function nextReadwiseApiRoundStartedAt(connectionRef: string, requested: string) {
  const latest = loadReadwiseApiScopeLedgers(connectionRef).reduce(
    (value, ledger) => Math.max(value, Date.parse(ledger.runStartedAt) || 0),
    0
  );
  const parsed = Date.parse(requested);
  return Number.isFinite(parsed) && parsed <= latest
    ? new Date(latest + 1).toISOString()
    : requested;
}

function loadScope(connectionRef: string, scope: ReadwiseApiIndexScope) {
  const row = openDatabaseConnection().driver.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [connectionRef, LEDGER_KIND, scope]
  );
  return row ? parse(row.payload_json)[0] ?? null : null;
}

function saveScope(connectionRef: string, ledger: ReadwiseApiScopeLedger) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
     VALUES (?, ?, ?, ?) ON CONFLICT(connection_ref, record_kind, remote_id)
     DO UPDATE SET payload_json = excluded.payload_json`,
    [connectionRef, LEDGER_KIND, ledger.scope, JSON.stringify(ledger)]
  );
  return ledger;
}

function parse(value: string): ReadwiseApiScopeLedger[] {
  try {
    const row = JSON.parse(value) as ReadwiseApiScopeLedger;
    return row?.scope && (row.status === 'complete' || row.status === 'running') ? [row] : [];
  } catch {
    return [];
  }
}
