// @vitest-environment node

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { recordSqliteStatement } from './sqlRecording.js';
import { NUMBERED_MIGRATION_STEP } from './sqlScaleProbe.testSupport.js';
import { defaultScaleGrowthLimits, findSuperlinearGrowth } from './sqlScaleRatio.testSupport.js';
import { LOOP_EXECUTIONS, runWithScaleProbe } from './sqlScanPlan.testSupport.js';

function library(rows = 100) {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE items (id INTEGER PRIMARY KEY, tag TEXT, kind TEXT);
    CREATE TABLE audit (item_id INTEGER, tag TEXT);
    CREATE INDEX idx_items_kind ON items(kind);`);
  const insert = sqlite.prepare('INSERT INTO items (tag, kind) VALUES (?, ?)');
  for (let index = 0; index < rows; index += 1) insert.run(`tag-${index}`, index % 2 ? 'note' : 'topic');
  return sqlite;
}

function scannedTables(findings: Awaited<ReturnType<typeof runWithScaleProbe>>['fullScanFindings']) {
  return findings.map((finding) => `${finding.via}:${finding.table}`);
}

it('attributes recorded statements to their application caller without hiding scans', async () => {
  const sqlite = library();
  try {
    const run = await runWithScaleProbe('recorded-loop', () => {
      const sql = 'SELECT id FROM items WHERE tag = ?';
      const lookup = recordSqliteStatement(sqlite.prepare(sql), sql);
      for (let index = 0; index < LOOP_EXECUTIONS; index += 1) lookup.get(`tag-${index}`);
    });
    expect(scannedTables(run.fullScanFindings)).toEqual(['statement:items']);
    expect(run.fullScanFindings[0]!.record.caller).toMatch(/^electron\/database\/sqlScaleProbe\.test\.ts:\d+$/u);
  } finally { sqlite.close(); }
});

describe('sql scale probe', () => {
  it('flags a loop statement that scans a table and passes the indexed version', async () => {
    const sqlite = library();
    const scan = await runWithScaleProbe('loop', () => {
      const lookup = sqlite.prepare('SELECT id FROM items WHERE tag = ?');
      for (let index = 0; index < LOOP_EXECUTIONS; index += 1) lookup.get(`tag-${index}`);
    });
    expect(scannedTables(scan.fullScanFindings)).toEqual(['statement:items']);
    sqlite.exec('CREATE INDEX idx_items_tag ON items(tag)');
    const indexed = await runWithScaleProbe('loop', () => {
      const lookup = sqlite.prepare('SELECT id FROM items WHERE tag = ?');
      for (let index = 0; index < LOOP_EXECUTIONS; index += 1) lookup.get(`tag-${index}`);
    });
    expect(indexed.fullScanFindings).toEqual([]);
  });

  it('flags a trigger that scans for each written row and a lookup that only narrows by a constant', async () => {
    const sqlite = library();
    sqlite.exec(`CREATE TRIGGER audit_items AFTER INSERT ON audit BEGIN
      UPDATE items SET tag = NEW.tag WHERE tag = NEW.tag; END`);
    const run = await runWithScaleProbe('loop', () => {
      const write = sqlite.prepare('INSERT INTO audit (item_id, tag) VALUES (?, ?)');
      const byKind = sqlite.prepare("SELECT COUNT(*) FROM items WHERE kind = 'note' AND tag > ?");
      for (let index = 0; index < LOOP_EXECUTIONS; index += 1) {
        write.run(index, `tag-${index}`);
        byKind.get(`tag-${index}`);
      }
    });
    expect(scannedTables(run.fullScanFindings).sort()).toEqual(['statement:items', 'trigger audit_items:items']);
  });

  it('names each numbered migration by the version it commits', async () => {
    const sqlite = library(1);
    const run = await runWithScaleProbe(NUMBERED_MIGRATION_STEP, (probe) => {
      sqlite.prepare('SELECT 1').get();
      sqlite.pragma('user_version = 7');
      sqlite.prepare('SELECT 2').get();
      probe.setStep('after');
    });
    expect([...run.probe.records.keys()]).toEqual(['schema_v7', 'after_numbered_migrations']);
  });

  it('flags execution counts that grow faster than the library', async () => {
    const sqlite = library(1);
    const execute = (times: number) => runWithScaleProbe('step', () => {
      const statement = sqlite.prepare('SELECT 1');
      for (let index = 0; index < times; index += 1) statement.get();
    });
    const limits = defaultScaleGrowthLimits(4);
    const small = await execute(10);
    expect(findSuperlinearGrowth(small.probe, (await execute(40)).probe, limits)).toEqual([]);
    expect(findSuperlinearGrowth(small.probe, (await execute(160)).probe, limits).map((finding) => finding.kind))
      .toEqual(['executions']);
  });
});
