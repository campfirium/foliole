// @vitest-environment node
/* global process, Buffer */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.ts';
import { auditDatabase, compareAudits } from './database-audit.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(path.resolve('.tmp/artifacts/t284-test-'));
  roots.push(root);
  const dbPath = path.join(root, 'source.db');
  const db = new DatabaseSync(dbPath);
  const adapter = { pragma: (sql) => { const row = db.prepare(`PRAGMA ${sql}`).get(); return row ? Object.values(row)[0] : undefined; }, exec: (sql) => db.exec(sql), prepare: (sql) => db.prepare(sql),
    transaction: (callback) => () => {
      db.exec('BEGIN');
      try { callback(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
    } };
  initializeDatabaseSchema(adapter);
  return { root, dbPath, db };
}

function snapshot(dbPath, root) {
  const output = path.join(root, 'snapshot.db');
  execFileSync('python3', ['scripts/database/database-audit-snapshot.py', '--db', dbPath, '--out', output], { stdio: 'pipe' });
  return output;
}

it('audits the production fresh schema and preserves WAL-committed data without changing source', () => {
  const { db, dbPath, root } = fixture();
  db.exec(`PRAGMA journal_mode=WAL;
    INSERT INTO nodes(id,title,content,created_at,updated_at)
    VALUES('audit-node','SECRET TITLE','SECRET BODY','2026-10-01','2026-10-01')`);
  const before = db.prepare('SELECT COUNT(*) AS rows FROM nodes').get().rows;
  const output = snapshot(dbPath, root);
  const report = auditDatabase(output, 'fixture-main');
  expect(report.tables.nodes.rows).toBe(before);
  if (process.env.FOLIOLE_DATABASE_AUDIT_EVIDENCE_ROOT) {
    writeFileSync(path.join(process.env.FOLIOLE_DATABASE_AUDIT_EVIDENCE_ROOT, 'fresh-report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  expect(report.integrity.ok).toBe(true);
  expect(report.foreignKeyViolationCount).toBe(0);
  expect(report.checks.missingParent.rows).toBe(0);
  expect(JSON.stringify(report)).not.toMatch(/SECRET TITLE|SECRET BODY/);
  expect(db.prepare('SELECT content FROM nodes WHERE id=?').get('audit-node').content).toBe('SECRET BODY');
  db.close();
});

it('reports orphan observations and byte growth without silently changing retention', () => {
  const { db, dbPath, root } = fixture();
  // Deliberately inject historical corruption into the isolated fixture.
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec(`INSERT INTO nodes(id,parent_id,title,content,created_at,updated_at)
    VALUES('orphan','absent','中','文','2026-10-01','2026-10-01')`);
  const output = snapshot(dbPath, root);
  const report = auditDatabase(output, 'fixture-main');
  expect(report.checks.missingParent).toEqual({ status: 'measured', rows: 1 });
  const sourceBytes = Object.values(db.prepare('SELECT * FROM nodes').get()).reduce((sum, value) =>
    sum + (value === null ? 0 : Buffer.byteLength(String(value))), 0);
  expect(report.tables.nodes.payloadBytes).toBe(sourceBytes);
  expect(report.tables.nodes.columnDefinitions.find((column) => column.name === 'id').primaryKeyOrdinal).toBe(1);
  expect(report.checks.importCacheDuplicatePreview.status).toBe('measured');
  expect(report.tables.nodes.rows).toBe(1);
  db.close();
});

it('compares added, removed and changed tables and refuses another logical library', () => {
  const table = (rows, schemaSha256 = 'a') => ({ rows, payloadBytes: rows * 3, schemaSha256 });
  const before = { label: 'fixture-main', tables: { nodes: table(1), retired: table(2) } };
  const now = { label: 'fixture-main', tables: { nodes: table(3, 'b'), added: table(1) } };
  expect(compareAudits(now, before)).toEqual({
    added: { state: 'added', rowsDelta: null, payloadBytesDelta: null, schemaChanged: null },
    nodes: { state: 'present', rowsDelta: 2, payloadBytesDelta: 6, schemaChanged: true },
    retired: { state: 'removed', rowsDelta: null, payloadBytesDelta: null, schemaChanged: null }
  });
  expect(() => compareAudits({ ...now, label: 'other' }, before)).toThrow('Baseline label');
});

it('refuses offline mode for a live WAL and refuses existing snapshot targets', () => {
  const { db, dbPath, root } = fixture();
  db.exec('PRAGMA journal_mode=WAL; INSERT INTO settings VALUES(\'test\',\'value\',\'now\')');
  expect(() => execFileSync('python3', ['scripts/database/database-audit-snapshot.py',
    '--db', dbPath, '--out', path.join(root, 'unsafe.db'), '--offline'], { stdio: 'pipe' })).toThrow();
  const output = snapshot(dbPath, root);
  const hash = createHash('sha256').update(readFileSync(output)).digest('hex');
  expect(() => snapshot(dbPath, root)).toThrow();
  expect(createHash('sha256').update(readFileSync(output)).digest('hex')).toBe(hash);
  db.close();
});

it('limits table metrics for a targeted structure audit and reports skipped full integrity', () => {
  const { db, dbPath, root } = fixture();
  const output = snapshot(dbPath, root);
  const report = auditDatabase(output, 'fixture-main', ['nodes']);
  expect(Object.keys(report.tables)).toEqual(['nodes']);
  expect(report.integrity.ok).toBe(null);
  expect(report.checks.missingParent.rows).toBe(0);
  expect(() => compareAudits(report, { ...report, scope: 'all-tables' })).toThrow('Baseline scope');
  db.close();
});

it('audits FTS sidecar tables and shadow storage without exposing indexed text', () => {
  const root = mkdtempSync(path.resolve('.tmp/artifacts/t284-test-'));
  roots.push(root);
  const dbPath = path.join(root, 'index.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE VIRTUAL TABLE node_search USING fts5(content, node_id UNINDEXED);
    INSERT INTO node_search VALUES('PRIVATE INDEX BODY','private-node');
    CREATE TABLE search_metadata(key TEXT PRIMARY KEY, value TEXT)`);
  const output = snapshot(dbPath, root);
  const report = auditDatabase(output, 'fixture-index');
  expect(report.tables.node_search.rows).toBe(1);
  expect(report.tables.node_search_data.rows).toBeGreaterThan(0);
  expect(report.checks.missingParent.status).toBe('not-applicable');
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE INDEX BODY|private-node/);
  expect(report.integrity.ok).toBe(true);
  db.close();
});
