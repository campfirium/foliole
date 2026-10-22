// @vitest-environment node
import { mkdir, writeFile } from 'node:fs/promises';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { branch } from '../../electron/sync/syncPackStoredVersionDependencies.testSupport.js';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { createCompanionRequestFixture, native } from './companionRequestSync.testSupport';

type Work = { statements: number; rows: number };

// Each mobile DbPort call crosses the native bridge, so per-round calls that grow with shared
// history would turn one receive-while-editing round into seconds on a phone.
async function receiveWhileEditing(historySize: number) {
  const host = await createCompanionRequestFixture();
  const desktop = new Database(host.fixture.rightSnapshot.databasePath);
  const body = (label: string) => `${label}\n${'Shared paragraph text. '.repeat(250)}`;
  const history = [branch('v0', body('v0'))];
  for (let i = 1; i < historySize; i++) history.push(branch(`v${i}`, body(`v${i}`), history.at(-1)));
  try {
    for (const sqlite of [host.sqlite, desktop]) {
      const db = createBetterSqliteDbPort(sqlite);
      await applySyncNodesWithDbPort(db, history);
      await collectNodeVersionPayloads(db, 'node-1', Number.MAX_SAFE_INTEGER);
    }
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    const head = history.at(-1)!;
    await applySyncNodesWithDbPort(createBetterSqliteDbPort(desktop), [branch('remote-edit', body('Remote edit'), head)]);
    await applySyncNodesWithDbPort(host.db, [branch('local-edit', body('Local edit'), head)]);
    const work: Work = { statements: 0, rows: 0 };
    native.db = counted(host.db, work);
    const started = performance.now();
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    const roundMs = Math.round(performance.now() - started);
    native.db = createBetterSqliteDbPort(host.sqlite);
    await host.restart();
    for (const sqlite of [host.sqlite, desktop]) {
      const ids = sqlite.prepare("SELECT version_id FROM node_sync_versions WHERE object_id = 'node-1'").pluck().all();
      expect(ids).toEqual(expect.arrayContaining(['remote-edit', 'local-edit']));
      expect(ids.length).toBeGreaterThanOrEqual(historySize + 2);
    }
    return { historySize, ...work, roundMs };
  } finally { desktop.close(); await host.close(); }
}

function counted(db: DbPort, work: Work): DbPort {
  return {
    async run(sql, params) { work.statements++; return db.run(sql, params); },
    async query<T extends DbRow = DbRow>(sql: string, params?: DbParams) {
      work.statements++;
      const rows = await db.query<T>(sql, params);
      work.rows += rows.length;
      return rows;
    },
    transaction: execute => db.transaction(tx => execute(counted(tx, work)))
  };
}

it('keeps mobile receive-while-editing database calls independent of shared history length', async () => {
  const short = await receiveWhileEditing(10);
  const long = await receiveWhileEditing(239);
  await mkdir('.tmp/artifacts', { recursive: true });
  await writeFile('.tmp/artifacts/t359-receive-while-editing-work.json', JSON.stringify({
    scope: 'Mobile DbPort calls in one round that receives a remote edit while a local edit is pending; Mac timing only',
    samples: [short, long]
  }, null, 2));
  expect(long.statements).toBeLessThanOrEqual(short.statements + 20);
}, 240000);
