// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'learning-facts', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs') }) }));

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { desktopDailyFlowPersistence } from '../../electron/database/dailyFlow';
import { initializeDatabase } from '../../electron/database/migrate';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations';
import { parentOrderId, writeParentChildOrder } from '../../lib/core/database/parentChildOrder';
import { flowPlan } from '../../lib/core/flow/dailyFlowPlanning';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings';

const now = '2026-10-26T08:00:00.000Z';
const settings = { newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };
beforeEach(async () => {
  await fs.mkdir('.tmp/artifacts/T519', { recursive: true });
  root = await fs.mkdtemp(path.resolve('.tmp/artifacts/T519/desktop-'));
  initializeDatabase();
});
afterEach(async () => { closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

it('preserves desktop manual order and profiles while learning eligibility avoids display storage', async () => {
  const connection = openDatabaseConnection();
  for (const id of ['a', 'b', 'c']) upsertNodeSnapshot({ nodeId: id, title: `Title ${id}`, kind: 'topic',
    parentNodeId: null, content: `Display body ${id}`, reveal: null, isTitleManual: true,
    anchorLink: null, position: 0, createdAt: now, updatedAt: now });
  writeParentChildOrder(connection.driver, parentOrderId(null), ['c', 'a', 'b'], now);
  const db = createBetterSqliteDbPort(connection.sqlite);
  const display = await desktopDailyFlowPersistence.snapshot(db);
  const learning = await desktopDailyFlowPersistence.learningSnapshot(db);
  expect(learning.nodeOrder).toEqual(display.nodeOrder);
  expect(learning.nodeOrder.filter(id => ['a', 'b', 'c'].includes(id))).toEqual(['c', 'a', 'b']);
  for (const mode of ['reading-only', 'recommended', 'review-first'] as const) {
    expect(flowPlan(learning, mode, now, settings)).toEqual(flowPlan(display, mode, now, settings));
  }
  connection.sqlite.exec('ALTER TABLE content_blobs RENAME TO unavailable_display_blobs');
  expect(await desktopDailyFlowPersistence.learningSnapshot(db)).toEqual(learning);
  connection.sqlite.exec('ALTER TABLE unavailable_display_blobs RENAME TO content_blobs');
  const initial = await openDailyFlow(db, { now, mode: 'reading-only' }, settings, desktopDailyFlowPersistence);
  const id = initial.session.currentNodeId!;
  const advanced = await commitDailyFlow(db, { opId: 'soon-no-display', now, token: initial.session.daily!,
    sourceSession: initial.session, readingAction: 'soon', readings: [{ nodeId: id, before: null, after: null }] },
  settings, desktopDailyFlowPersistence);
  expect(advanced.session.currentNodeId).not.toBe(id);
  expect(advanced.session.readTopicCount).toBe(1);
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS n FROM node_reading').get()).toEqual({ n: 0 });
});
