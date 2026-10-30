// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { useCompanionFlowSession } from './useCompanionFlowSession';

const now = '2026-10-28T08:00:00.000Z';
let root = '';
let database: Database.Database | null = null;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-daily-entry-'));
  const file = path.join(root, 'companion.db');
  const existed = existsSync(file);
  const sqlite = new Database(file);
  database = sqlite;
  await initializeIosCompanionDatabase({ booted_at: now, database_path: null, database_ready: false,
    host_name: 'Entry fixture', runtime_kind: 'android-capacitor' },
  createFakeCapacitorDatabaseManager(sqlite, existed, () => { database = null; }));
  const nodes: WorkspaceNodeSnapshot[] = ['a', 'b'].map(id => ({ id, parentNodeId: null, kind: 'topic',
    title: id, content: `Body ${id}`, hasContent: true, reveal: null, review: null, reading: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: now, isTitleManual: true, hideTitleHeading: false, anchorLink: null }));
  await applyCompanionLocalNodeVersions(await Promise.all(nodes.map(node => toWorkspaceNativeNodeVersion(node, 'fixture'))));
});
afterEach(async () => {
  cleanup();
  await runCompanionSyncWriterTask(async () => undefined);
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

it('takes the first native current from saved facts instead of seeding it with a stale renderer plan', async () => {
  const expected = await openCompanionDailyFlow({ now, mode: 'recommended' });
  const expectedId = expected.session.currentNodeId!;
  const state = await loadCompanionWorkspaceSyncState();
  if (!state.workspace_snapshot) throw new Error('missing fixture snapshot');
  const snapshot = { ...state.workspace_snapshot, nodesById: { ...state.workspace_snapshot.nodesById,
    [expectedId]: { ...state.workspace_snapshot.nodesById[expectedId]!, reading: { intervalDurationMs: 0,
      intervalGrowthFactor: 1, lastHandledAt: now, nextAt: now, priority: 5,
      readingPosition: 0, repetitionCount: 0, state: 'locked' as const } } } };
  await writeIosCompanionDatabase(async db => {
    await db.run('DELETE FROM daily_flow_state');
    await db.run('DELETE FROM daily_flow_entries');
    await db.run('DELETE FROM daily_flow_operations');
  });
  const app = renderHook(() => useCompanionFlowSession({ snapshot, ready: true, active: true,
    libraryScope: 'entry-fixture' }));
  await waitFor(() => expect(app.result.current.ready).toBe(true));
  expect(app.result.current.capture().nodeId).toBe(expectedId);
  expect(app.result.current.summary.readTopicCount).toBe(0);
  expect(app.result.current.capture().session.totalNodeCount).toBe(2);
  const reopened = await openCompanionDailyFlow({ now, mode: 'recommended' });
  expect(reopened.session.currentNodeId).toBe(expectedId);
  expect(reopened.session.totalNodeCount).toBe(2);
});
