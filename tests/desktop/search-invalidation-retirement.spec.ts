import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('normal search maintenance retires completed work immediately and keeps new content searchable', async ({
  desktopApp, desktopWindow: page
}, testInfo) => {
  await expectWorkspaceShell(page);
  await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const Database = require('better-sqlite3');
    const database = new Database(connection.resolveDatabasePath());
    try {
      const insert = database.prepare(
        `INSERT INTO search_index_invalidations (
          invalidation_type, target_id, status, created_at, updated_at, completed_at
        ) VALUES ('node_workspace', ?, 'completed', ?, ?, ?)`
      );
      const now = new Date().toISOString();
      for (const [id, completedAt] of [
        ['t281-completed-old', '2020-01-01T00:00:00.000Z'],
        ['t281-completed-recent', now], ['t281-completed-undated', null]
      ]) insert.run(id, now, now, completedAt);
    } finally {
      database.close();
    }
  });
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { id: 't281-searchable', kind: 'topic', title: 'RetirementSentinel', content: 'Search task retirement.' }
    ], { persist: true });
  });
  await expect.poll(() => page.evaluate(async () => {
    const result = await window.electronAPI?.invoke('search_workspace', { query: 'RetirementSentinel' });
    return result?.results.map((item) => item.id) ?? [];
  })).toContain('t281-searchable');
  await expect.poll(() => desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const Database = require('better-sqlite3');
    const database = new Database(connection.resolveDatabasePath(), { readonly: true });
    try {
      return database.prepare(
        "SELECT COUNT(*) AS count FROM search_index_invalidations WHERE target_id LIKE 't281-completed-%' OR target_id = 't281-searchable'"
      ).get().count;
    } finally {
      database.close();
    }
  })).toBe(0);
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(() => page.evaluate(async () => {
    const result = await window.electronAPI?.invoke('search_workspace', { query: 'RetirementSentinel' });
    return result?.results.map((item) => item.id) ?? [];
  })).toContain('t281-searchable');
  await testInfo.attach('search-retirement', {
    body: JSON.stringify({ retiredAllCompleted: true, searchableAfterReload: true }), contentType: 'application/json'
  });
});

test('an unsuccessful attempt stays pending and automatically disappears after recovery', async ({
  desktopApp, desktopWindow: page
}) => {
  await expectWorkspaceShell(page);
  await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const Database = require('better-sqlite3');
    const database = new Database(connection.resolveDatabasePath());
    try {
      database.exec(`CREATE TRIGGER t281_block_completion BEFORE DELETE ON search_index_invalidations
       WHEN OLD.target_id = 't281-retry' BEGIN SELECT RAISE(ABORT, 'temporary completion failure'); END`);
    } finally {
      database.close();
    }
  });
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { id: 't281-retry', kind: 'topic', title: 'AutomaticRetrySentinel', content: 'Retry after recovery.' }
    ], { persist: true });
  });
  await expect.poll(() => desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const Database = require('better-sqlite3');
    const database = new Database(connection.resolveDatabasePath(), { readonly: true });
    try {
      return database.prepare("SELECT status FROM search_index_invalidations WHERE target_id = 't281-retry' AND last_error IS NOT NULL").get()?.status;
    } finally {
      database.close();
    }
  })).toBe('pending');
  await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const Database = require('better-sqlite3');
    const database = new Database(connection.resolveDatabasePath());
    try {
      database.exec('DROP TRIGGER t281_block_completion');
    } finally {
      database.close();
    }
  });
  await expect.poll(() => desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const Database = require('better-sqlite3');
    const database = new Database(connection.resolveDatabasePath(), { readonly: true });
    try {
      return database.prepare("SELECT COUNT(*) AS count FROM search_index_invalidations WHERE target_id = 't281-retry'").get().count;
    } finally {
      database.close();
    }
  }), { timeout: 35_000 }).toBe(0);
  await expect.poll(() => page.evaluate(async () => {
    const result = await window.electronAPI?.invoke('search_workspace', { query: 'AutomaticRetrySentinel' });
    return result?.results.map((item) => item.id) ?? [];
  })).toContain('t281-retry');
});
