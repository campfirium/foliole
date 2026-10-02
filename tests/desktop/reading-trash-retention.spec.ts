import process from 'node:process';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'reading-trash-retention';
const GHOST_ID = 'historical-reading-ghost';

async function readingFacts(session: DesktopSession) {
  return session.electronApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      return { reading: db.prepare('SELECT * FROM node_reading WHERE node_id = ?').get(id),
        positions: db.prepare('SELECT * FROM node_reading_host_state WHERE node_id = ? ORDER BY host_name').all(id),
        deleted: db.prepare('SELECT deleted_at FROM nodes WHERE id = ?').pluck().get(id),
        ghost: db.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'historical-reading-ghost'").pluck().get() };
    });
  }, NODE_ID);
}

async function seedReadingFacts(session: DesktopSession) {
    await session.electronApp.evaluate(async (_, { id, ghost }) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
      const reading = require(`${process.cwd()}/dist/electron/database/nodeReadingState.js`);
      const nodes = require(`${process.cwd()}/dist/electron/database/nodeMutations.js`);
      await connection.runWithDatabaseConnectionOwner(() => {
        for (const nodeId of [id, ghost]) reading.saveNodeReadingState({ nodeId, updatedAt: new Date().toISOString(), reading: {
          intervalDurationMs: 12000, intervalGrowthFactor: 1.5, lastHandledAt: new Date().toISOString(),
          nextAt: '2030-01-01T00:00:00.000Z', priority: 3, readingPosition: 0.42, repetitionCount: 2, state: 'active'
        } });
        nodes.softDeleteNodes({ nodeIds: [ghost], deletedAt: new Date().toISOString() });
        const db = connection.openDatabaseConnection().sqlite;
        db.prepare('DELETE FROM node_reading WHERE node_id = ?').run(ghost);
        db.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?').run(ghost);
        db.prepare('DELETE FROM data_migration_state WHERE migration_id = ?').run('orphaned-inactive-reading-state-v1');
      });
    }, { id: NODE_ID, ghost: GHOST_ID });
}

test('keeps reading progress through Trash, restart and restore while retiring an old orphan', async ({ desktopSession, desktopWindow }, testInfo) => {
  let reopened: DesktopSession | null = null;
  let restored: DesktopSession | null = null;
  const env = desktopSession.env;
  try {
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.evaluate(async ({ id, ghost }) => {
      await window.__folioleWorkspaceDebug?.seedNodes?.([
        { id, kind: 'topic', title: 'Reading retention', content: 'Retained reading body' },
        { id: ghost, kind: 'topic', title: 'Old removed reading', content: 'Historical body' }
      ], { persist: true });
    }, { id: NODE_ID, ghost: GHOST_ID });
    await seedReadingFacts(desktopSession);
    await desktopSession.close();
    reopened = await launchDesktopSession({ env });
    await expectWorkspaceShell(reopened.firstWindow);
    const before = await readingFacts(reopened);
    expect(before.ghost).toBe(0);
    expect(before.reading).toMatchObject({ repetition_count: 2, state: 'active' });
    expect(before.positions).toEqual(expect.arrayContaining([expect.objectContaining({ reading_position: 0.42 })]));
    await reopened.firstWindow.evaluate(async (id) => window.__folioleWorkspaceDebug?.deleteNode?.(id), NODE_ID);
    await expect.poll(async () => (await readingFacts(reopened!)).deleted).toBeTruthy();
    const trashed = await readingFacts(reopened);
    expect(trashed.reading).toEqual(before.reading);
    expect(trashed.positions).toEqual(before.positions);
    await reopened.close();
    reopened = await launchDesktopSession({ env });
    await expectWorkspaceShell(reopened.firstWindow);
    const afterRestart = await readingFacts(reopened);
    expect(afterRestart.reading).toEqual(before.reading);
    expect(afterRestart.positions).toEqual(before.positions);
    await reopened.firstWindow.evaluate(async (id) => window.__folioleWorkspaceDebug?.restoreNode?.(id), NODE_ID);
    await expect.poll(async () => (await readingFacts(reopened!)).deleted).toBeNull();
    await reopened.close();
    restored = await launchDesktopSession({ env });
    await expectWorkspaceShell(restored.firstWindow);
    const final = await readingFacts(restored);
    expect(final.reading).toEqual(before.reading);
    expect(final.positions).toEqual(before.positions);
    await testInfo.attach('reading-trash-retention', { body: JSON.stringify({ before, trashed, afterRestart, final }, null, 2), contentType: 'application/json' });
  } finally {
    await restored?.close();
    await reopened?.close();
  }
});
