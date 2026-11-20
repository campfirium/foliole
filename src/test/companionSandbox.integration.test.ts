// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { assertCompanionSandboxPath, prepareCompanionSandbox } from '../../scripts/vite/companionSandboxSeed';

let root: string | undefined;
afterEach(() => { if (root) rmSync(root, { force: true, recursive: true }); });

it('creates a seeded workspace, preserves edits on a normal start, and resets only the sandbox', async () => {
  mkdirSync('.tmp/artifacts', { recursive: true });
  root = mkdtempSync(path.resolve('.tmp/artifacts/companion-sandbox-'));
  const preview = path.join(root, '.cache/companion-preview');
  const sandbox = path.join(preview, 'sandbox/foliole-companionSQLite.db');
  const device = path.join(preview, 'device/foliole-companionSQLite.db');
  for (const file of [sandbox, device]) mkdirSync(path.dirname(file), { recursive: true });

  const copy = new Database(device);
  copy.exec("CREATE TABLE sentinel (title TEXT); INSERT INTO sentinel VALUES ('Device copy');");
  copy.close();
  expect(() => assertCompanionSandboxPath(root!, device)).toThrow('its own preview database');
  assertCompanionSandboxPath(root, sandbox);
  await prepareCompanionSandbox(sandbox, false);

  const live = new Database(sandbox);
  expect(live.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get('sandbox-topic')).toBe('ver_sandbox-topic');
  live.prepare('UPDATE nodes SET title = ? WHERE id = ?').run('Edited sample', 'sandbox-topic');
  live.close();

  await prepareCompanionSandbox(sandbox, false);
  expect(readValue(sandbox, "SELECT title FROM nodes WHERE id = 'sandbox-topic'")).toBe('Edited sample');
  await prepareCompanionSandbox(sandbox, true);
  expect(readValue(sandbox, "SELECT title FROM nodes WHERE id = 'sandbox-topic'")).toBe('Sample Field Notes');
  expect(readValue(device, 'SELECT title FROM sentinel')).toBe('Device copy');

  rmSync(sandbox);
  symlinkSync(device, sandbox);
  expect(() => assertCompanionSandboxPath(root!, sandbox)).toThrow('cannot be a link');
});

function readValue(file: string, sql: string) {
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return database.prepare(sql).pluck().get();
  } finally {
    database.close();
  }
}
