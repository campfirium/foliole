// @vitest-environment node
import { expect, it } from 'vitest';

import { ATTACHMENT_BATCH_LIMITS } from '../../lib/core/sync/attachmentBatchContract.js';
import { readRequestSyncAttachmentNeedsSlice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';

import { demandFixture, imageBody, imageKey } from './attachmentDemandQueue.testSupport.js';

it('fills a bounded batch demand slice while preserving equal new/retry chances and the native stat limit', async () => {
  const fixture = demandFixture();
  try {
    const insert = fixture.sqlite.prepare('INSERT INTO attachment_pending VALUES (?, ?, ?, ?, ?)');
    fixture.sqlite.transaction(() => {
      for (let i = 0; i < 300; i++) insert.run(`retry-${i}`, imageKey(i), 'body', '2000', '2001');
      for (let i = 0; i < 300; i++) fixture.insert(`fresh-${i}`, imageBody(imageKey(1000 + i)));
    })();
    const probes: number[] = [];
    const result = await readRequestSyncAttachmentNeedsSlice(fixture.host, async keys => {
      probes.push(keys.length); return keys.map(() => false);
    }, () => false, false, ATTACHMENT_BATCH_LIMITS.entries);
    expect(result.keys).toHaveLength(256);
    expect(result.keys.filter(key => Number.parseInt(key.slice(0, 64), 16) < 1000)).toHaveLength(128);
    expect(result.keys.filter(key => Number.parseInt(key.slice(0, 64), 16) >= 1000)).toHaveLength(128);
    expect(probes).toEqual([64, 64, 64, 64]);
    expect(result.pending).toBe(true);
  } finally { fixture.sqlite.close(); }
});
