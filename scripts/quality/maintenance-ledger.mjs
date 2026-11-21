// Ledger of quality-maintenance runs: which release each maintenance item last ran for.
// docs/maintenance/quality-maintenance-ledger.json is the source of truth; entries are
// appended by `maintenance-release-plan.mjs --record` and never rewritten.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const LEDGER_RELATIVE_PATH = 'docs/maintenance/quality-maintenance-ledger.json';
export const LEDGER_FORMAT_VERSION = 1;

export function emptyLedger() {
  return { formatVersion: LEDGER_FORMAT_VERSION, runs: [] };
}

export function readLedger(ledgerPath) {
  if (!existsSync(ledgerPath)) return emptyLedger();
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  if (ledger.formatVersion !== LEDGER_FORMAT_VERSION || !Array.isArray(ledger.runs)) {
    throw new Error(`${ledgerPath}: unsupported ledger format`);
  }
  return ledger;
}

export function writeLedger(ledgerPath, ledger) {
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

export function resolveLedgerPath(repoRoot, override) {
  return override ? path.resolve(override) : path.join(repoRoot, LEDGER_RELATIVE_PATH);
}

/** Most recent run of `item` by date, ties broken by ledger order. */
export function latestRun(ledger, item) {
  let latest = null;
  for (const run of ledger.runs) {
    if (run.item !== item) continue;
    if (!latest || run.date >= latest.date) latest = run;
  }
  return latest;
}

export function validateRun(run, knownItems) {
  const errors = [];
  if (!knownItems.includes(run.item)) errors.push(`unknown item: ${run.item}`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(run.date ?? '')) errors.push('date must be YYYY-MM-DD');
  if (!run.release && !run.revision) errors.push('release or revision is required');
  return errors;
}

export function appendRuns(ledger, runs, knownItems) {
  const errors = runs.flatMap((run) => validateRun(run, knownItems).map((error) => `${run.item}: ${error}`));
  if (errors.length > 0) throw new Error(errors.join('; '));
  return { ...ledger, runs: [...ledger.runs, ...runs] };
}
