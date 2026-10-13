// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

it('preserves all conflict alternative bodies in a fresh companion library through current request snapshots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-request-alternatives-'));
  const desktop = textDevice(); const file = path.join(root, 'companion.db');
  let sqlite = new Database(file);
  try {
    const base = textBranch('base', 'Base');
    await desktop.receive([base, textBranch('a', 'Main longest body', base)]);
    const whole = await desktop.receive([textBranch('b', 'B', base), textBranch('c', 'C', base)]);
    await bootstrapCompanionDatabase(createBetterSqliteDbPort(sqlite), {
      allowCreate: true, expectedHostName: 'receiver', now: '2026-10-06'
    });
    const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(desktop.db), remote: [] })
      .find(value => value.globalId === 'topic')!;
    await withRequestSyncFiles(createDesktopFramedSyncFiles(root), async request => {
      await writeRequestSyncSnapshot(desktop.db, difference, request);
      for (let repeat = 0; repeat < 2; repeat++) await applyFramedFactSources(createBetterSqliteDbPort(sqlite),
        [() => request.readFacts()], { requireCompleteVersionGraph: true, loadBody: (_db, blob) => request.loadBody(blob) });
    });
    sqlite.close(); sqlite = new Database(file);
    const restored = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(sqlite), 'topic');
    expect(restored?.version_id).toBe(whole.version_id);
    expect(wholeBodies(restored!)).toEqual(new Set(['Main longest body', 'B', 'C']));
    expect(restored?.snapshot.text_alternatives).toEqual(whole.snapshot.text_alternatives);
  } finally { desktop.sqlite.close(); sqlite.close(); await rm(root, { recursive: true, force: true }); }
});
