// @vitest-environment node
import { expect, it } from 'vitest';

import { parseChangedAttachmentArticles, recordAttachmentDemandAttempt } from '../../lib/core/sync/attachmentDemandQueue.js';
import { readRequestSyncAttachmentNeedsSlice as slice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';

import { demandFixture, imageBody, imageKey, observeDemandQueries } from './attachmentDemandQueue.testSupport.js';

it('bounds both phases and rotates old missing demand while new content keeps arriving', async () => {
  const f = demandFixture();
  try {
    const seed = f.sqlite.prepare(`INSERT INTO attachment_pending VALUES (?, ?, 'body', '2000', '2001')`);
    f.sqlite.transaction(() => {
      for (let i = 0; i < 10000; i++) seed.run(`old-${i}`, imageKey(i));
      for (let i = 0; i < 300; i++) f.insert(`queued-${i}`, '');
    })();
    let bodyReads = 0;
    const host = observeDemandQueries(f, sql => { if (sql.includes('FROM nodes')) bodyReads++; });
    const seen = new Set<string>();
    for (let round = 0; round < 5; round++) {
      const fresh = imageKey(20000 + round);
      f.insert(`new-${round}`, imageBody(fresh));
      // A normal import backlog is drained over bounded rounds.
      const before = bodyReads;
      const result = await slice(host, async keys => { keys.forEach(key => seen.add(key)); return keys.map(() => false); }, () => false);
      for (const key of result.keys) await recordAttachmentDemandAttempt(f.port, key);
      expect(bodyReads - before).toBeLessThanOrEqual(64);
      expect(result.keys.length).toBeLessThanOrEqual(64);
      expect(result.pending).toBe(true);

      expect(result.keys.some(key => Number.parseInt(key.slice(0, 64), 16) < 10000)).toBe(true);
    }
    expect([...seen].filter(key => Number.parseInt(key.slice(0, 64), 16) < 10000).length).toBeGreaterThanOrEqual(160);
    expect(seen.has(imageKey(20000))).toBe(true);
    expect(f.queued()).toEqual([]);
  } finally { f.sqlite.close(); }
});

it('splits new and retry slots and gives unused slots to the other side', async () => {
  const f = demandFixture();
  try {
    const seed = f.sqlite.prepare('INSERT INTO attachment_pending VALUES (?, ?, ?, ?, ?)');
    for (let i = 0; i < 100; i++) seed.run(`old-${i}`, imageKey(i), 'body', '2000', '2001');
    f.insert('new', imageBody(imageKey(1000)));
    const result = await slice(f.host, async keys => keys.map(() => false), () => false);
    expect(result.keys.length).toBe(64); expect(result.keys).toContain(imageKey(1000));
    expect(new Set(result.keys).size).toBe(64);
  } finally { f.sqlite.close(); }
});

it('makes bounded parsing progress even when the time budget is exhausted', async () => {
  const f = demandFixture();
  try {
    for (let i = 0; i < 3; i++) f.insert(`article-${i}`, imageBody(imageKey(i)));
    let reads = 0;
    const host = observeDemandQueries(f, sql => { if (sql.includes('FROM nodes')) reads++; });
    await parseChangedAttachmentArticles(host, () => true);
    expect(reads).toBe(1);
    expect(f.queued()).toHaveLength(2);
    await parseChangedAttachmentArticles(host, () => false);
    expect(f.queued()).toEqual([]);
    expect(f.pending()).toEqual([imageKey(0), imageKey(1), imageKey(2)]);
  } finally { f.sqlite.close(); }
});
