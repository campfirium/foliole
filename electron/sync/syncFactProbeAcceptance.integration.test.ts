import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { measureEmptyFactPage, SYNC_FACT_PROBE_SCHEMA
} from '../../src/companion/syncFactProbeAcceptance.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it('measures the real empty-receiver fact probe without claiming source history', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const statement of SYNC_FACT_PROBE_SCHEMA) sqlite.exec(statement);
    const port = createBetterSqliteDbPort(sqlite);
    const first = await measureEmptyFactPage(port, 32);
    const second = await measureEmptyFactPage(port, 128);
    expect([first.facts, second.facts]).toEqual([32, 128]);
    expect([first.claimed, second.claimed]).toEqual([0, 0]);
    expect(first.queryCalls).toBeGreaterThan(0);
    expect(second.queryCalls).toBeGreaterThan(0);
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM sync_pack_known_fact_claims
      WHERE kind <> 'progress'`).get()).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get())
      .toEqual({ count: 0 });
  } finally { sqlite.close(); }
});
