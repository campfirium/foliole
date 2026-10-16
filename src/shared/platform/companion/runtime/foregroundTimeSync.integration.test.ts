// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { saveForegroundTime } from '../../../../../lib/core/database/foregroundTimeStore';
import { createCompanionRequestFixture } from '../../../../test/companionRequestSync.testSupport';

import { iosCompanionContentHash, markIosCompanionMutation } from './iosCompanionMutationState';

const sourceA = '11111111-1111-4111-8111-111111111111';

async function save(host: Awaited<ReturnType<typeof createCompanionRequestFixture>>, durationMs: number) {
  await saveForegroundTime(host.db, { sourceId: sourceA, buckets: [{ day: '2026-10-04', durationMs }],
    hash: iosCompanionContentHash,
    mark: (tx, record) => markIosCompanionMutation({ db: tx, hostName: 'mobile', objectType: 'foreground_source',
      objectId: record.id, contentHash: record.hash, updatedAt: record.updatedAt }) });
}

it('converges cumulative foreground time while an older peer value remains without adding it twice', async () => {
  const host = await createCompanionRequestFixture();
  const desktop = new Database(host.fixture.rightSnapshot.databasePath);
  try {
    await save(host, 60_000);
    await host.sync();
    expect(desktop.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 60_000 });
    await save(host, 120_000);
    await host.sync();
    await host.sync();
    await host.restart();
    for (const db of [host.sqlite, desktop]) {
      expect(db.prepare('SELECT duration_ms FROM foreground_daily_time').all()).toEqual([{ duration_ms: 120_000 }]);
    }
  } finally { desktop.close(); await host.close(); }
}, 20000);
