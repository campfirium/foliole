import Database from 'better-sqlite3';

export type SqlStatementMethod = 'all' | 'exec' | 'get' | 'iterate' | 'run';

export interface SqlStatementRecord {
  method: SqlStatementMethod;
  rows: number;
  sql: string;
}

export interface SqlStatementGroup {
  count: number;
  rows: number;
  sql: string;
}

export interface SqlStatementReport {
  groups: SqlStatementGroup[];
  records: SqlStatementRecord[];
  rowsRead: number;
  statements: number;
}

type Callable = (this: unknown, ...args: unknown[]) => unknown;

const TRANSACTION_CONTROL = /^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
let activeRecords: SqlStatementRecord[] | null = null;

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

function record(method: SqlStatementMethod, source: unknown, rows: number) {
  if (!activeRecords || typeof source !== 'string') return;
  const sql = normalizeSql(source);
  if (TRANSACTION_CONTROL.test(sql)) return;
  activeRecords.push({ method, rows, sql });
}

function countIteratedRows(iterator: IterableIterator<unknown>, source: unknown) {
  const entry: SqlStatementRecord | null = activeRecords && typeof source === 'string'
    ? { method: 'iterate', rows: 0, sql: normalizeSql(source) } : null;
  if (entry && !TRANSACTION_CONTROL.test(entry.sql)) activeRecords!.push(entry);
  const next = iterator.next.bind(iterator);
  iterator.next = (...args: [] | [undefined]) => {
    const step = next(...args);
    if (entry && !step.done) entry.rows += 1;
    return step;
  };
  return iterator;
}

function rowsOf(method: SqlStatementMethod, result: unknown) {
  if (method === 'all') return Array.isArray(result) ? result.length : 0;
  if (method === 'get') return result === undefined ? 0 : 1;
  return 0;
}

function statementSource(statement: unknown) {
  return typeof statement === 'object' && statement !== null && 'source' in statement
    ? statement.source : undefined;
}

function resolvePrototypes() {
  const probe = new Database(':memory:');
  try {
    const statement = Object.getPrototypeOf(probe.prepare('SELECT 1')) as Record<string, Callable>;
    return { database: Database.prototype as unknown as Record<string, Callable>, statement };
  } finally {
    probe.close();
  }
}

function install() {
  const { database, statement } = resolvePrototypes();
  const originals = new Map<string, Callable>();
  for (const method of ['all', 'get', 'run'] as const) {
    const original = statement[method]!;
    originals.set(method, original);
    statement[method] = function meteredStatement(this: unknown, ...args: unknown[]) {
      const result = Reflect.apply(original, this, args);
      record(method, statementSource(this), rowsOf(method, result));
      return result;
    };
  }
  const iterate = statement.iterate!;
  statement.iterate = function meteredIterate(this: unknown, ...args: unknown[]) {
    return countIteratedRows(Reflect.apply(iterate, this, args) as IterableIterator<unknown>, statementSource(this));
  };
  const exec = database.exec!;
  database.exec = function meteredExec(this: unknown, ...args: unknown[]) {
    record('exec', args[0], 0);
    return Reflect.apply(exec, this, args);
  };
  return () => {
    for (const [method, original] of originals) statement[method] = original;
    statement.iterate = iterate;
    database.exec = exec;
  };
}

function summarize(records: SqlStatementRecord[]): SqlStatementReport {
  const bySql = new Map<string, SqlStatementGroup>();
  for (const entry of records) {
    const group = bySql.get(entry.sql) ?? { count: 0, rows: 0, sql: entry.sql };
    group.count += 1;
    group.rows += entry.rows;
    bySql.set(entry.sql, group);
  }
  const groups = [...bySql.values()].sort((left, right) => right.count - left.count || right.rows - left.rows);
  const rowsRead = records.reduce((total, entry) => total + entry.rows, 0);
  return { groups, records, rowsRead, statements: records.length };
}

/**
 * Counts every SQL statement executed through better-sqlite3 while `execute` runs.
 * Transaction control statements are excluded. Measurements must not overlap.
 */
export async function measureSqlStatements<T>(execute: () => Promise<T> | T) {
  if (activeRecords) throw new Error('SQL statement measurements cannot overlap.');
  const records: SqlStatementRecord[] = [];
  activeRecords = records;
  const uninstall = install();
  try {
    const result = await execute();
    return { report: summarize(records), result };
  } finally {
    uninstall();
    activeRecords = null;
  }
}
