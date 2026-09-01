#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';
import ts from 'typescript';

import {
  readBusinessSentinels,
  readStructureSummary,
  sha256
} from './public-desktop-database-fixture-contract.mjs';
import { validatePublicDesktopDatabaseLedger } from './public-desktop-database-ledger.mjs';

const ROOT = process.cwd();
const LEDGER_PATH = path.join(ROOT, 'lib/core/database/publicDesktopDatabaseLedger.json');
const FIXTURE_ROOT = path.join(ROOT, 'electron/database/fixtures/public-desktop-main');
const TEMP_ROOT = path.join(ROOT, '.tmp/public-desktop-fixture-generation');
const NOW = '2026-01-15T12:00:00.000Z';

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, { cwd: ROOT, encoding });
}

function taggedLibrarySourceFiles(tag) {
  return git(['ls-tree', '-r', '--name-only', tag, 'lib'])
    .trim().split('\n').filter((file) => (
      (file.endsWith('.ts') && !file.endsWith('.test.ts')) || file.endsWith('.json')
    ));
}

function materializeTaggedLibrarySource(tag, destination) {
  const files = taggedLibrarySourceFiles(tag);
  const sourceDigest = createHash('sha256');
  for (const file of files) {
    const source = git(['show', `${tag}:${file}`]);
    sourceDigest.update(`${file}\0${source}\0`);
    const outputPath = path.join(destination, file.endsWith('.ts') ? file.replace(/\.ts$/, '.js') : file);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    const output = file.endsWith('.ts') ? ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
    }).outputText : source;
    writeFileSync(outputPath, output);
  }
  writeFileSync(path.join(destination, 'package.json'), '{"type":"module"}\n');
  return { files, sourceDigest: sourceDigest.digest('hex') };
}

function insertBusinessSentinels(sqlite) {
  const insert = sqlite.transaction(() => {
    sqlite.prepare(`INSERT INTO nodes
      (id, parent_id, kind, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      't166-root', null, 'topic', 'T166 Fixture Root', '# Stable user content', NOW, NOW
    );
    sqlite.prepare(`INSERT INTO nodes
      (id, parent_id, kind, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      't166-child', 't166-root', 'note', 'T166 Fixture Child', 'Preserve this child.', NOW, NOW
    );
    sqlite.prepare(`INSERT INTO node_review
      (node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      't166-child', '2026-02-01T00:00:00.000Z', NOW, 2, 3.5, 4.25, 7, 14, 5, 1
    );
    sqlite.prepare(`INSERT INTO node_reading
      (node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      't166-child', 900000, 1.75, NOW, '2026-01-16T12:00:00.000Z', 0.8, 3, 'active'
    );
    sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      't166.fixture.preference', '{"enabled":true}', NOW
    );
    sqlite.prepare(`INSERT INTO sync_peers
      (peer_id, status, last_synced_at, last_seen_version_cursor, updated_at)
      VALUES (?, ?, ?, ?, ?)`).run('t166-peer', 'paired', NOW, 't166-cursor', NOW);
  });
  insert();
}

async function createFixture(fixture) {
  const tempSource = path.join(TEMP_ROOT, `schema-${fixture.schema}`);
  const materialized = materializeTaggedLibrarySource(fixture.sourceRelease, tempSource);
  const migrationsUrl = pathToFileURL(path.join(tempSource, 'lib/core/database/migrations.js')).href;
  const { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } = await import(migrationsUrl);
  if (DATABASE_SCHEMA_VERSION !== fixture.schema) {
    throw new Error(`${fixture.sourceRelease} reports schema ${DATABASE_SCHEMA_VERSION}`);
  }
  const fixturePath = path.join(FIXTURE_ROOT, fixture.file);
  mkdirSync(path.dirname(fixturePath), { recursive: true });
  rmSync(fixturePath, { force: true });
  const sqlite = new Database(fixturePath);
  sqlite.pragma('foreign_keys = ON');
  initializeDatabaseSchema(sqlite);
  insertBusinessSentinels(sqlite);
  const provenance = {
    schema: fixture.schema,
    sourceRelease: fixture.sourceRelease,
    sourceCommit: git(['rev-parse', `${fixture.sourceRelease}^{commit}`]).trim(),
    sourceLibraryFilesSha256: materialized.sourceDigest,
    sourceLibraryFileCount: materialized.files.length,
    creationPath: 'tagged initializeDatabaseSchema fresh path',
    dataOrigin: 'deterministic synthetic business sentinels; no user data',
    sqliteIntegrity: sqlite.pragma('integrity_check', { simple: true }),
    foreignKeyViolations: sqlite.pragma('foreign_key_check').length,
    structure: readStructureSummary(sqlite),
    businessSentinelsSha256: sha256(JSON.stringify(readBusinessSentinels(sqlite)))
  };
  sqlite.close();
  return { ...provenance, file: fixture.file, databaseSha256: sha256(readFileSync(fixturePath)) };
}

async function main() {
  const ledger = validatePublicDesktopDatabaseLedger(JSON.parse(readFileSync(LEDGER_PATH, 'utf8')));
  rmSync(TEMP_ROOT, { force: true, recursive: true });
  mkdirSync(TEMP_ROOT, { recursive: true });
  const fixtures = [];
  for (const fixture of ledger.fixtures) fixtures.push(await createFixture(fixture));
  const manifest = { manifestVersion: 1, ledger: path.relative(ROOT, LEDGER_PATH), fixtures };
  mkdirSync(FIXTURE_ROOT, { recursive: true });
  writeFileSync(path.join(FIXTURE_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(TEMP_ROOT, { force: true, recursive: true });
  console.log(`generated ${fixtures.length} public Desktop database fixtures`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
