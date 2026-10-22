import Database from 'better-sqlite3';

/**
 * Records every SQLite statement execution made through better-sqlite3 while installed, so scale tests can
 * find statements that run inside loops and compare their cost between library sizes. Execution is not altered.
 */
export interface SqlExecutionRecord {
  sql: string;
  step: string;
  count: number;
  totalMs: number;
  caller: string;
  sqlite: Database.Database;
  lastArgs: unknown[];
}

export interface SqlScaleProbe {
  /** Keyed by step, then normalized SQL. */
  records: Map<string, Map<string, SqlExecutionRecord>>;
  /** Wall time of each step, including JavaScript work between statements. */
  stepMs: Map<string, number>;
  /** Start a named step; `NUMBERED_MIGRATION_STEP` lets each `user_version` write close one migration. */
  setStep(step: string): void;
  onExecution?: (record: SqlExecutionRecord) => void;
  paused: boolean;
  uninstall(): void;
}

export const NUMBERED_MIGRATION_STEP = 'numbered_migration';
/** Work after the last `user_version` write: version-commit hooks and startup preparation. */
export const AFTER_NUMBERED_MIGRATIONS_STEP = 'after_numbered_migrations';
const EXECUTE_METHODS = ['run', 'get', 'all', 'iterate'] as const;
const originalPrepare = Database.prototype.prepare;
const originalPragma = Database.prototype.pragma;
type ActiveProbe = SqlScaleProbe & { step: string; stepStart: number };
let active: ActiveProbe | null = null;

/** Collapse whitespace and variable-length placeholder lists so one loop statement keeps one identity. */
export function normalizeSql(sql: string) {
  return sql.replace(/\s+/gu, ' ').replace(/\?(?:\s*,\s*\?)+/gu, '?…').trim();
}

/** Original prepare, for plan inspection that must not be recorded. */
export function prepareUnrecorded(sqlite: Database.Database, sql: string) {
  return originalPrepare.call(sqlite, sql) as Database.Statement<unknown[]>;
}

function firstAppCaller() {
  const frame = (new Error().stack ?? '').split('\n').slice(1).find((line) => /\/(?:electron|lib)\//u.test(line) &&
    !/sqlScaleProbe|sqliteStatementCache|betterSqlite3Driver|guardedBetterSqliteDatabase|node_modules/u.test(line));
  return (frame ?? '').replace(/^.*\/((?:electron|lib)\/[^):]+:\d+).*$/u, '$1').trim();
}

function recordExecution(sqlite: Database.Database, sql: string, args: unknown[], ms: number) {
  const probe = active!;
  let step = probe.records.get(probe.step);
  if (!step) probe.records.set(probe.step, step = new Map());
  const key = normalizeSql(sql);
  let record = step.get(key);
  if (!record) {
    record = { sql, step: probe.step, count: 0, totalMs: 0, caller: firstAppCaller(), sqlite, lastArgs: [] };
    step.set(key, record);
  }
  record.count += 1;
  record.totalMs += ms;
  record.sqlite = sqlite;
  record.lastArgs = args;
  probe.onExecution?.(record);
}

function wrapStatement(statement: Database.Statement, sqlite: Database.Database, sql: string) {
  for (const method of EXECUTE_METHODS) {
    const original = statement[method] as (...args: unknown[]) => unknown;
    Object.defineProperty(statement, method, {
      configurable: true,
      value: function recorded(this: Database.Statement, ...args: unknown[]) {
        if (!active || active.paused) return original.apply(this, args);
        const start = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          recordExecution(sqlite, sql, args, performance.now() - start);
        }
      }
    });
  }
  return statement;
}

function closeStep(probe: ActiveProbe, label = probe.step) {
  const now = performance.now();
  probe.stepMs.set(label, (probe.stepMs.get(label) ?? 0) + now - probe.stepStart);
  probe.stepStart = now;
  if (label === probe.step) return;
  const records = probe.records.get(probe.step);
  probe.records.delete(probe.step);
  if (!records) return;
  for (const record of records.values()) record.step = label;
  probe.records.set(label, records);
}

/** Install the recorder on better-sqlite3 for every connection opened while it is active. */
export function installSqlScaleProbe(initialStep = 'start'): SqlScaleProbe {
  if (active) throw new Error('sql_scale_probe_already_installed');
  const probe: ActiveProbe = {
    records: new Map(),
    stepMs: new Map(),
    paused: false,
    step: initialStep,
    stepStart: performance.now(),
    setStep: (next) => {
      closeStep(probe, probe.step === NUMBERED_MIGRATION_STEP ? AFTER_NUMBERED_MIGRATIONS_STEP : probe.step);
      probe.step = next;
    },
    uninstall: () => {
      closeStep(probe, probe.step === NUMBERED_MIGRATION_STEP ? AFTER_NUMBERED_MIGRATIONS_STEP : probe.step);
      Database.prototype.prepare = originalPrepare;
      Database.prototype.pragma = originalPragma;
      active = null;
    }
  };
  Database.prototype.prepare = function recordedPrepare(this: Database.Database, sql: string) {
    return wrapStatement(originalPrepare.call(this, sql) as Database.Statement, this, sql);
  } as typeof originalPrepare;
  Database.prototype.pragma = function recordedPragma(this: Database.Database, source: string, options?: object) {
    const result = originalPragma.call(this, source, options as never);
    const version = /^\s*user_version\s*=\s*(\d+)\s*$/iu.exec(source)?.[1];
    if (version && active === probe && probe.step === NUMBERED_MIGRATION_STEP) closeStep(probe, `schema_v${version}`);
    return result;
  } as typeof originalPragma;
  active = probe;
  return probe;
}

/** Run plan inspection without recording its own statements. */
export function withProbePaused<T>(probe: SqlScaleProbe, run: () => T) {
  probe.paused = true;
  try {
    return run();
  } finally {
    probe.paused = false;
  }
}
