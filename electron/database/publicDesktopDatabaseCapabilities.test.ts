// @vitest-environment node
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { readStoredReviewCard } from '../../lib/core/database/storedReviewCard.js';
import { findMissingDatabaseCapabilities, readDatabaseCapabilities } from '../../scripts/database/public-desktop-database-upgrade-contract.mjs';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { score } from './reviewProjection.testSupport.js';

it('recognizes historical review day storage after fractional grading and a cold reopen', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-review-capability-'));
  const file = path.join(root, 'foliole.db');
  copyFileSync('electron/database/fixtures/public-desktop-main/schema-78/foliole.db', file);
  let sqlite = new Database(file);
  const fresh = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    initializeDatabaseSchema(fresh);
    const columns = sqlite.prepare('PRAGMA table_info(node_review)').all() as { name: string; type: string }[];
    expect(columns.filter(row => ['elapsed_days', 'scheduled_days'].includes(row.name)).map(row => row.type))
      .toEqual(['INTEGER', 'INTEGER']);
    sqlite.prepare('UPDATE nodes SET enable_short_term = 1 WHERE id = ?').run('t166-child');
    score({ sqlite, id: 'capability-test' }, 'first-fraction', '2026-11-01T08:00:00.000Z', 1, 't166-child');
    score({ sqlite, id: 'capability-test' }, 'second-fraction', '2026-11-01T09:00:00.000Z', 1, 't166-child');
    const read = () => readStoredReviewCard(createBetterSqlite3Driver(sqlite), 't166-child')!;
    const graded = read();
    expect(graded.elapsed_days).toBeCloseTo(1 / 24);
    expect(graded.scheduled_days).toBeGreaterThan(0);
    expect(Number.isInteger(graded.scheduled_days)).toBe(false);
    sqlite.close();
    sqlite = new Database(file);
    initializeDatabaseSchema(sqlite);
    expect(read()).toEqual(graded);
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(findMissingDatabaseCapabilities(readDatabaseCapabilities(sqlite), readDatabaseCapabilities(fresh)))
      .toEqual([]);
  } finally {
    sqlite.close(); fresh.close(); rmSync(root, { force: true, recursive: true });
  }
});

it.each([
  ['INTEGER', 'REAL', ''], ['INTEGER', 'INTEGER', ''], ['REAL', 'REAL', ''], ['TEXT', 'REAL', 'column:node_review.elapsed_days'],
  ['BLOB', 'REAL', 'column:node_review.elapsed_days']
])('checks the review day numeric storage contract for %s against %s', (actualType, requiredType, missing) => {
  const actual = new Database(':memory:'), required = new Database(':memory:');
  try {
    actual.exec(`CREATE TABLE node_review (elapsed_days ${actualType} NOT NULL DEFAULT 0)`);
    required.exec(`CREATE TABLE node_review (elapsed_days ${requiredType} NOT NULL DEFAULT 0)`);
    expect(findMissingDatabaseCapabilities(readDatabaseCapabilities(actual), readDatabaseCapabilities(required)))
      .toEqual(missing ? [missing] : []);
  } finally { actual.close(); required.close(); }
});

it.each([
  ['CREATE TABLE node_review (elapsed_days INTEGER)', 'CREATE TABLE node_review (elapsed_days REAL NOT NULL)'],
  ['CREATE TABLE node_review (elapsed_days INTEGER NOT NULL)', 'CREATE TABLE node_review (elapsed_days REAL NOT NULL, scheduled_days REAL NOT NULL)'],
  ['CREATE TABLE other (elapsed_days INTEGER NOT NULL)', 'CREATE TABLE other (elapsed_days REAL NOT NULL)'],
  ['CREATE TABLE node_review (elapsed_days INTEGER NOT NULL) STRICT', 'CREATE TABLE node_review (elapsed_days REAL NOT NULL)'],
  ['CREATE TABLE node_review (stability INTEGER NOT NULL)', 'CREATE TABLE node_review (stability REAL NOT NULL)']
])('keeps nullability, missing columns and unrelated numeric types protected: %s', (statement, requirement) => {
  const actual = new Database(':memory:'), required = new Database(':memory:');
  try {
    actual.exec(statement);
    required.exec(requirement);
    const missing = findMissingDatabaseCapabilities(readDatabaseCapabilities(actual), readDatabaseCapabilities(required));
    expect(missing).not.toEqual([]);
  } finally { actual.close(); required.close(); }
});
