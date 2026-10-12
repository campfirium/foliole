import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  return { count: values.length, totalMs, meanMs: totalMs / values.length,
    p50Ms: sorted[Math.ceil(values.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(values.length * 0.95) - 1], maxMs: sorted.at(-1) };
}

function openCase(root, mode) {
  const file = path.join(root, `${mode}.db`);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE samples(id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  db.exec(`PRAGMA synchronous=${mode}`);
  const settings = { journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode,
    synchronous: db.prepare('PRAGMA synchronous').get().synchronous,
    pageSize: db.prepare('PRAGMA page_size').get().page_size,
    autoCheckpoint: db.prepare('PRAGMA wal_autocheckpoint').get().wal_autocheckpoint };
  if (settings.journalMode !== 'wal' || settings.synchronous !== (mode === 'FULL' ? 2 : 1)) {
    db.close(); throw new Error('SQLite diagnostic settings did not apply');
  }
  return { db, file, mode, settings, insert: db.prepare('INSERT INTO samples VALUES (?, ?)'),
    commits: [], transactions: [], batches: [], errors: 0 };
}

function measureBatch(item, start, end) {
  const commits = [];
  for (let i = start; i < end; i++) {
    const transactionStart = performance.now();
    try {
      item.db.exec('BEGIN IMMEDIATE');
      item.insert.run(i, 'x'.repeat(256));
      const commitStart = performance.now();
      item.db.exec('COMMIT');
      const commitMs = performance.now() - commitStart;
      commits.push(commitMs); item.commits.push(commitMs);
      item.transactions.push(performance.now() - transactionStart);
    } catch (error) { item.errors++; throw error; }
  }
  item.batches.push({ start, end, commits: distribution(commits) });
}

export function runCommitMicro(root, count = 2000) {
  const temporaryRoot = fs.realpathSync(path.resolve('.tmp/artifacts'));
  const resolved = fs.existsSync(root) ? fs.realpathSync(root)
    : path.join(fs.realpathSync(path.dirname(root)), path.basename(root));
  const relative = path.relative(temporaryRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Micro benchmark requires repository temporary storage');
  fs.mkdirSync(root, { recursive: true });
  const runRoot = fs.mkdtempSync(path.join(root, 'commit-micro-'));
  const cases = [];
  const report = { kind: 'synthetic-commit-micro', node: process.version, platform: process.platform,
    arch: process.arch, host: os.hostname(), cpus: os.cpus().length, loadAverage: os.loadavg(),
    startedAt: new Date().toISOString(), runRoot, count, payloadBytes: 256, cases: [] };
  try {
    cases.push(openCase(runRoot, 'FULL')); cases.push(openCase(runRoot, 'NORMAL'));
    report.sqlite = cases[0].db.prepare('SELECT sqlite_version() AS version').get().version;
    for (let start = 0; start < count; start += 100) {
      for (const item of cases) measureBatch(item, start, Math.min(start + 100, count));
    }
    for (const item of cases) {
      item.db.close();
      const reopened = new DatabaseSync(item.file, { readOnly: true });
      let actual;
      try { actual = reopened.prepare('SELECT count(*) AS rows, sum(id) AS checksum FROM samples').get(); }
      finally { reopened.close(); }
      if (actual.rows !== count || actual.checksum !== count * (count - 1) / 2) throw new Error('Committed row verification failed');
      report.cases.push({ mode: item.mode, settings: item.settings, errors: item.errors,
        verified: actual, commits: distribution(item.commits), transactions: distribution(item.transactions), batches: item.batches });
    }
  } catch (error) { report.error = { message: error.message, code: error.code }; throw error; }
  finally {
    for (const item of cases) { try { item.db.close(); } catch { /* Already closed after verification. */ } }
    report.endedAt = new Date().toISOString();
    fs.writeFileSync(path.join(root, 'commit-micro.json'), JSON.stringify(report, null, 2));
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.stdout.write(`${JSON.stringify(runCommitMicro(path.resolve(process.argv[2])))}\n`);
}
