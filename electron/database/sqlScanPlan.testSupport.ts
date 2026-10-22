import type Database from 'better-sqlite3';

import {
  installSqlScaleProbe,
  prepareUnrecorded,
  type SqlExecutionRecord,
  type SqlScaleProbe
} from './sqlScaleProbe.testSupport.js';

/**
 * Query-plan side of the scale probe: a statement that runs many times in one operation must not walk a whole
 * table on each run, and neither may the triggers its writes fire.
 */
export interface FullScanFinding {
  /** The loop statement; its step label is final only after the operation ends. */
  record: SqlExecutionRecord;
  table: string;
  plan: string[];
  sql: string;
  via: 'statement' | `trigger ${string}`;
}

/** Tables whose size does not grow with the library; scanning them per row stays cheap. */
const BOUNDED_TABLES = new Set<string>([]);

/** A statement run this often within one step counts as a loop statement. */
export const LOOP_EXECUTIONS = 20;

const SCAN_DETAIL = /^SCAN (\S+)(?! VIRTUAL TABLE)/u;
const SEARCH_DETAIL = /^SEARCH (\S+) USING (?:COVERING )?INDEX \S+ \(([^)]*)\)/u;
const SUBQUERY_NAME = /^(?:CO-ROUTINE|MATERIALIZE) (\S+)/u;
/** An index lookup that matches this share of a table or more is a scan in disguise (`object_type = 'node'`). */
const MIN_DISTINCT_KEYS = 10;

function realTables(sqlite: Database.Database) {
  return new Set((prepareUnrecorded(sqlite, "SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[]).map((row) => row.name));
}

function resolveTable(name: string, sql: string, tables: Set<string>) {
  if (tables.has(name)) return name;
  const alias = new RegExp(`\\b(\\w+)\\s+(?:AS\\s+)?${name}\\b`, 'giu');
  for (const match of sql.matchAll(alias)) if (tables.has(match[1]!)) return match[1]!;
  return null;
}

/**
 * True when an index lookup only narrows by constants written into the SQL (`object_type = 'node'`) and those
 * split the table into too few keys: every run then reads one whole category, which grows with the library.
 */
function lowSelectivity(sqlite: Database.Database, sql: string, table: string, constraint: string) {
  const columns = constraint.split(' AND ').map((part) => /^(\w+)=\?$/u.exec(part.trim())?.[1]);
  if (columns.some((column) => !column)) return false;
  const literal = (column: string) => new RegExp(`\\b${column}\\s*(?:=\\s*(?:'[^']*'|\\d+)|IN\\s*\\(\\s*')`, 'iu').test(sql);
  if (!columns.every((column) => literal(column!))) return false;
  const list = columns.map((column) => `"${column}"`).join(', ');
  const stats = prepareUnrecorded(sqlite, `SELECT COUNT(*) AS total, (SELECT COUNT(*) FROM
    (SELECT DISTINCT ${list} FROM "${table}")) AS keys FROM "${table}"`).get() as { total: number; keys: number };
  return stats.total >= LOOP_EXECUTIONS && stats.keys < MIN_DISTINCT_KEYS;
}

function fullScans(sqlite: Database.Database, sql: string, args: unknown[], tables: Set<string>) {
  let plan: string[];
  try {
    plan = (prepareUnrecorded(sqlite, `EXPLAIN QUERY PLAN ${sql}`).all(...args) as { detail: string }[])
      .map((row) => row.detail);
  } catch {
    return [];
  }
  const subqueries = new Set(plan.map((detail) => SUBQUERY_NAME.exec(detail)?.[1]).filter(Boolean));
  const scanned = new Set<string>();
  for (const detail of plan) {
    const scan = SCAN_DETAIL.exec(detail)?.[1];
    const search = SEARCH_DETAIL.exec(detail);
    const name = scan ?? search?.[1];
    const table = name && !subqueries.has(name) ? resolveTable(name, sql, tables) : null;
    if (!table || BOUNDED_TABLES.has(table)) continue;
    if (scan || lowSelectivity(sqlite, sql, table, search![2]!)) scanned.add(table);
  }
  return [...scanned].map((table) => ({ table, plan }));
}

interface WriteTarget { table: string; event: 'INSERT' | 'UPDATE' | 'DELETE'; columns: Set<string> }

function writeTarget(sql: string): WriteTarget | null {
  const match = /^\s*(INSERT|REPLACE|UPDATE|DELETE)\b(?:\s+OR\s+\w+)?(?:\s+INTO|\s+FROM)?\s+["`]?(\w+)/iu.exec(sql);
  if (!match) return null;
  const verb = match[1]!.toUpperCase();
  const event = verb === 'UPDATE' ? 'UPDATE' : verb === 'DELETE' ? 'DELETE' : 'INSERT';
  const set = event === 'UPDATE' ? /\bSET\b([\s\S]*?)(?:\bWHERE\b|\bFROM\b|$)/iu.exec(sql)?.[1] ?? '' : '';
  const columns = new Set(Array.from(set.matchAll(/["`]?(\w+)["`]?\s*=(?!=)/gu), (column) => column[1]!.toLowerCase()));
  return { table: match[2]!, event, columns };
}

function splitStatements(body: string) {
  const statements: string[] = [];
  let current = '';
  let quote = '';
  for (const char of body) {
    if (quote) quote = char === quote ? '' : quote;
    else if (char === "'" || char === '"') quote = char;
    else if (char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function triggerFires(sql: string, target: WriteTarget) {
  const header = /\b(?:BEFORE|AFTER|INSTEAD\s+OF)\s+(INSERT|DELETE|UPDATE)(?:\s+OF\s+([\s\S]+?))?\s+ON\b/iu.exec(sql);
  if (!header || header[1]!.toUpperCase() !== target.event) return false;
  if (!header[2]) return true;
  return header[2].split(',').some((column) => target.columns.has(column.trim().replace(/["`]/gu, '').toLowerCase()));
}

/** Trigger body statements with NEW/OLD references turned into parameters, so they can be planned alone. */
function triggerStatements(sqlite: Database.Database, target: WriteTarget) {
  const triggers = prepareUnrecorded(sqlite, "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?")
    .all(target.table) as { name: string; sql: string }[];
  return triggers.filter(({ sql }) => triggerFires(sql, target)).flatMap(({ name, sql }) => {
    const body = /\bBEGIN\b([\s\S]*)\bEND\s*;?\s*$/iu.exec(sql)?.[1] ?? '';
    return splitStatements(body).map((statement) => {
      const planned = statement.replace(/\b(?:NEW|OLD)\.["`]?\w+["`]?/giu, '?');
      return { name, sql: planned, args: Array.from(planned.matchAll(/\?/gu), () => null) };
    });
  });
}

/** Full scans made by one loop statement and by every trigger its write fires. */
export function findLoopFullScans(record: SqlExecutionRecord): FullScanFinding[] {
  const tables = realTables(record.sqlite);
  const findings: FullScanFinding[] = fullScans(record.sqlite, record.sql, record.lastArgs, tables)
    .map((scan) => ({ record, ...scan, sql: record.sql, via: 'statement' as const }));
  const target = writeTarget(record.sql);
  if (!target) return findings;
  for (const trigger of triggerStatements(record.sqlite, target)) {
    for (const scan of fullScans(record.sqlite, trigger.sql, trigger.args, tables)) {
      findings.push({ record, ...scan, sql: trigger.sql, via: `trigger ${trigger.name}` });
    }
  }
  return findings;
}

/** Run one operation under the probe, planning each statement once it qualifies as a loop statement. */
export async function runWithScaleProbe(initialStep: string, operation: (probe: SqlScaleProbe) => unknown) {
  const probe = installSqlScaleProbe(initialStep);
  const fullScanFindings: FullScanFinding[] = [];
  probe.onExecution = (record) => {
    if (record.count === LOOP_EXECUTIONS) fullScanFindings.push(...findLoopFullScans(record));
  };
  try {
    await operation(probe);
  } finally {
    probe.uninstall();
  }
  return { probe, fullScanFindings };
}

/** Stable identity of a finding across edits: step, calling file, statement or trigger, scanned table. */
export function fullScanFindingId(finding: FullScanFinding) {
  return [finding.record.step, finding.record.caller.replace(/:\d+$/u, ''), finding.via, finding.table].join(' | ');
}

/** One block per distinct finding id, with the plan that shows the scan. */
export function formatFullScanFindings(findings: FullScanFinding[]) {
  const lines = new Map<string, string>();
  for (const finding of findings) {
    const { record } = finding;
    const key = fullScanFindingId(finding);
    if (lines.has(key)) continue;
    lines.set(key, [
      `${key} (ran ${record.count}x at ${record.caller})`,
      `  sql: ${finding.sql.replace(/\s+/gu, ' ').slice(0, 200)}`,
      ...finding.plan.map((detail) => `  plan: ${detail}`)
    ].join('\n'));
  }
  return [...lines.values()].join('\n');
}
