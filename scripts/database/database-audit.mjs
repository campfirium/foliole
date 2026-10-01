#!/usr/bin/env node
/* global process, console */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { getNumber } from '../sqlite/search-index-size-report-sql.mjs';
import { buildSearchIndexSizeReport } from '../sqlite/search-index-size-report-core.mjs';
import { columns, quote, readAuditChecks } from './database-audit-checks.mjs';

function tableMetrics(db, name, sql, space) {
  const indexes = db.prepare(`PRAGMA index_list(${quote(name)})`).all();
  const indexSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? ORDER BY name").all(name);
  const indexBytes = space ? indexes.reduce((sum, index) => sum + (space[index.name] ?? 0), 0) : null;
  const names = columns(db, name);
  const payload = names.map((column) => `COALESCE(length(CAST(${quote(column)} AS BLOB)),0)`).join('+') || '0';
  const distribution = names.includes('status')
    ? db.prepare(`SELECT status, COUNT(*) AS rows FROM ${quote(name)} GROUP BY status`).all() : null;
  // Status may be arbitrary user data in unknown tables. Only emit known queue enums.
  const statuses = distribution?.map((row) => ({
    status: ['pending', 'running', 'failed', 'completed', 'active', 'paused', 'success', 'error'].includes(row.status)
      ? row.status : 'other', rows: row.rows
  }));
  return {
    rows: getNumber(db, `SELECT COUNT(*) FROM ${quote(name)}`),
    payloadBytes: getNumber(db, `SELECT COALESCE(SUM(${payload}),0) FROM ${quote(name)}`),
    allocatedBytes: space ? (space[name] ?? 0) + indexBytes : null,
    indexBytes, indexes: indexes.map((index) => ({ name: index.name, unique: index.unique,
      columns: db.prepare(`PRAGMA index_info(${quote(index.name)})`).all().map((row) => row.name) })),
    schemaSha256: createHash('sha256').update(JSON.stringify([sql, indexSql])).digest('hex'),
    columns: names, columnDefinitions: db.prepare(`PRAGMA table_info(${quote(name)})`).all().map((row) => ({
      name: row.name, type: row.type, notNull: row.notnull, primaryKeyOrdinal: row.pk })),
    foreignKeys: db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all(),
    statuses: statuses ?? null
  };
}

function spaceStats(db) {
  try {
    return Object.fromEntries(db.prepare('SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name')
      .all().map((row) => [row.name, row.bytes]));
  } catch {
    return null;
  }
}

export function compareAudits(current, baseline) {
  if (current.formatVersion !== baseline.formatVersion) throw new Error('Baseline format must match');
  if (current.label !== baseline.label) throw new Error('Baseline label must match the same logical database');
  if (JSON.stringify(current.scope) !== JSON.stringify(baseline.scope)) throw new Error('Baseline scope must match');
  const names = new Set([...Object.keys(current.tables), ...Object.keys(baseline.tables)]);
  return Object.fromEntries([...names].sort().map((name) => {
    const now = current.tables[name];
    const before = baseline.tables[name];
    return [name, { state: !before ? 'added' : !now ? 'removed' : 'present',
      rowsDelta: now && before ? now.rows - before.rows : null,
      payloadBytesDelta: now && before ? now.payloadBytes - before.payloadBytes : null,
      schemaChanged: now && before ? now.schemaSha256 !== before.schemaSha256 : null }];
  }));
}

function sourceBaseline() {
  const files = execFileSync('rg', ['--files', 'lib/core/database', 'electron/database'], { encoding: 'utf8' }).trim().split('\n').sort();
  const digest = createHash('sha256');
  for (const file of files) digest.update(file).update(readFileSync(file));
  const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  return { databaseSourceFilesSha256: digest.digest('hex'), sourceFileCount: files.length, head: git(['rev-parse', 'HEAD']),
    dirtyDiffSha256: createHash('sha256').update(git(['diff', 'HEAD', '--', 'lib/core/database', 'electron/database'])).digest('hex'),
    note: 'Shared working tree; snapshot schema is authoritative, not a frozen release candidate.' };
}

export function auditDatabase(dbPath, label, selected = null) {
  if (!existsSync(dbPath)) throw new Error('Database does not exist');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON; BEGIN');
    const schema = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
    if (selected?.some((name) => !schema.some((row) => row.name === name))) throw new Error('Selected table does not exist');
    const scoped = selected ? schema.filter((row) => selected.includes(row.name)) : schema;
    const space = spaceStats(db);
    const tables = Object.fromEntries(scoped.map((row) => [row.name, tableMetrics(db, row.name, row.sql, space)]));
    const integrity = selected ? null : db.prepare('PRAGMA integrity_check').all();
    const foreignKeys = selected ? selected.flatMap((table) => db.prepare(`PRAGMA foreign_key_check(${quote(table)})`).all())
      : db.prepare('PRAGMA foreign_key_check').all();
    return {
      formatVersion: 1, auditImplementationSha256: createHash('sha256')
        .update(readFileSync('scripts/database/database-audit.mjs'))
        .update(readFileSync('scripts/database/database-audit-checks.mjs')).digest('hex'),
      label, scope: selected ?? 'all-tables', capturedAt: new Date().toISOString(), source: sourceBaseline(),
      database: { path: dbPath, sha256: createHash('sha256').update(readFileSync(dbPath)).digest('hex'),
        schemaVersion: getNumber(db, 'PRAGMA user_version'),
        pageBytes: getNumber(db, 'PRAGMA page_count') * getNumber(db, 'PRAGMA page_size'),
        reusableBytes: getNumber(db, 'PRAGMA freelist_count') * getNumber(db, 'PRAGMA page_size'),
        dbstatAvailable: space !== null },
      integrity: { ok: integrity ? integrity.length === 1 && Object.values(integrity[0])[0] === 'ok' : null,
        violationCount: integrity?.filter((row) => Object.values(row)[0] !== 'ok').length ?? null },
      foreignKeyViolationCount: foreignKeys.length, tables,
      checks: readAuditChecks(db, schema.map((row) => row.name), selected),
      interpretation: 'Counts are observations, not deletion eligibility. Unknown retention stays unknown.'
    };
  } finally {
    db.close();
  }
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => args[args.indexOf(name) + 1];
  if (!args.includes('--db') || !args.includes('--out') || !args.includes('--label')) {
    throw new Error('Required: --db isolated-snapshot --out report.json --label stable-library-and-role');
  }
  const dbPath = path.resolve(option('--db'));
  const output = path.resolve(option('--out'));
  if (output === dbPath || existsSync(output)) throw new Error('Report output must be a new file');
  const provenancePath = `${dbPath}.json`;
  if (!existsSync(provenancePath)) throw new Error('Create an isolated snapshot with database:audit:snapshot first');
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
  const report = auditDatabase(dbPath, option('--label'), args.includes('--tables') ? option('--tables').split(',') : null);
  if (provenance.snapshotSha256 !== report.database.sha256) throw new Error('Snapshot changed since capture');
  report.provenance = provenance;
  if (args.includes('--baseline')) report.comparison = compareAudits(report,
    JSON.parse(readFileSync(option('--baseline'), 'utf8')));
  // Reuse the existing specialist report only for its aggregate, privacy-safe sections.
  if (args.includes('--specialist')) {
    const specialist = buildSearchIndexSizeReport(dbPath);
    report.specialist = { contentBlobData: specialist.contentBlobData,
      keepImportItemCache: specialist.keepImportItemCache,
      searchIndexInvalidations: specialist.searchIndexInvalidations };
  }
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`Database audit: ${Object.keys(report.tables).length} tables; report ${output}`);
  if (report.integrity.ok === false || report.foreignKeyViolationCount > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
