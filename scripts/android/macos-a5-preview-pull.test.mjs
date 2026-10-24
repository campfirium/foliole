// @vitest-environment node

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { resolveMacosA5Identity } from './macos-a5-app-identity.mjs';
import { companionPreviewDeviceDatabase, pullCompanionPreviewDatabase } from './macos-a5-preview-pull.mjs';

const roots = [];
function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'a5-preview-pull-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function pulledLibraryWithUncheckpointedRow() {
  const pulled = path.join(tempRoot(), 'foliole-companion.db');
  const writer = new Database(pulled);
  writer.pragma('journal_mode = WAL');
  writer.pragma('wal_autocheckpoint = 0');
  writer.exec("CREATE TABLE nodes (id TEXT PRIMARY KEY); INSERT INTO nodes VALUES ('only-in-wal');");
  return { pulled, writer };
}

it('installs a pulled library as one self-contained preview copy and discards the pull', async () => {
  const repoRoot = tempRoot();
  const { pulled, writer } = pulledLibraryWithUncheckpointedRow();

  const target = await pullCompanionPreviewDatabase({ adb: 'adb', appId: 'app', repoRoot, serial: 's',
    pull: async () => ({ databasePath: pulled }) });
  writer.close();

  expect(target).toBe(companionPreviewDeviceDatabase(repoRoot));
  const copy = new Database(target, { readonly: true });
  expect(copy.prepare('SELECT id FROM nodes').all()).toEqual([{ id: 'only-in-wal' }]);
  copy.close();
  expect(existsSync(pulled)).toBe(false);
});

it('registers preview-pull as a read-only device action for either application', () => {
  expect(assertRegisteredMacosA5Action('preview-pull')).toMatchObject({
    deviceLeaseMode: 'readonly-lifecycle', formalSourceClass: 'ordinary-only', mutatesFixedA5: false
  });
  expect(resolveMacosA5Identity('preview-pull', 'test')).toBe('test');
});
