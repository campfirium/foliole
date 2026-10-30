// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: mockedAppDataDir,
  app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
  app_log_dir: path.join(mockedAppDataDir, 'logs') }) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { assertSameJourneyFacts, loadDesktopJourneyFacts } from '../../scripts/desktop/desktop-sync-journey-facts.mjs';
import { closeDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { handleWorkspaceReadCommand } from './storageReadCommands.js';

let root = '';
afterEach(async () => {
  closeDatabaseConnection();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

it('reads acceptance facts through the actual workspace command parser and SQLite documents', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-journey-command-'));
  mockedAppDataDir = path.join(root, 'app-data');
  initializeDatabase();
  const expected = ['A1', 'A2', 'C1'].map(id => ({ id,
    title: `Multi-device sync ${id[0]} fact`, content: `Original body ${id}` }));
  for (const [position, node] of expected.entries()) upsertNodeSnapshot({
    nodeId: node.id, title: node.title, content: node.content, anchorLink: null, parentNodeId: null,
    kind: 'topic', position, reveal: null, isTitleManual: true,
    createdAt: '2026-10-30T00:00:00.000Z', updatedAt: '2026-10-30T00:00:00.000Z'
  });
  const session = { invoke: async (command: string, args: Record<string, unknown>) =>
    runWithDatabaseConnectionOwner<unknown>(() => handleWorkspaceReadCommand(command, args)) };
  const actual = await loadDesktopJourneyFacts(session);
  expect(actual).toEqual(expected);
  expect(() => assertSameJourneyFacts(expected, actual)).not.toThrow();
});
