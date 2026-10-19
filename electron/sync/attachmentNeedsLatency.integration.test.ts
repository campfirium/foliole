import { expect, it } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { readRequestSyncAttachmentNeedsSlice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';

import { demandFixture, imageBody, imageKey } from './attachmentDemandQueue.testSupport.js';

it('retires a full slice of present files within the bridge latency budget and retains missing demand', async () => {
  const fixture = demandFixture();
  const keys = Array.from({ length: 64 }, (_, index) => imageKey(index + 1));
  fixture.insert('article', keys.map(imageBody).join('\n'));
  // A real SQLite port with a controlled 15ms native write round trip.
  const delayed = (db: DbPort): DbPort => ({ ...db,
    async run(sql, params) {
      await new Promise(resolve => setTimeout(resolve, 15));
      return db.run(sql, params);
    },
    transaction: execute => db.transaction(tx => execute(delayed(tx)))
  });
  const host = { ...fixture.host,
    write: <T>(write: (db: DbPort) => Promise<T>) => fixture.host.write(db => write(delayed(db)))
  };
  try {
    const started = performance.now();
    const result = await readRequestSyncAttachmentNeedsSlice(host,
      batch => Promise.resolve(batch.map(key => key !== keys[63])), () => false);
    const elapsed = performance.now() - started;
    expect(result.keys).toEqual([keys[63]]);
    expect(fixture.pending()).toEqual([keys[63]]);
    expect(elapsed).toBeLessThan(500);
  } finally { fixture.sqlite.close(); }
});
