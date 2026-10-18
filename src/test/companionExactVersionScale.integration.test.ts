// @vitest-environment node
import { mkdir, writeFile } from 'node:fs/promises';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { branch } from '../../electron/sync/syncPackStoredVersionDependencies.testSupport.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { canonicalFactFromValidatedMessage } from '../../lib/core/sync/framedSyncWireFact.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { createCompanionRequestFixture, native } from './companionRequestSync.testSupport';

it.each([10, 100, 1000])('transmits one new full version across %i shared versions over production HTTP', async historySize => {
  const host = await createCompanionRequestFixture();
  const target = new Database(host.fixture.rightSnapshot.databasePath);
  const history = [branch('v0', 'original')];
  for (let i = 1; i < historySize; i++) history.push(branch(`v${i}`, 'previous', history.at(-1)));
  const samples: Record<string, unknown>[] = [];
  try {
    for (const sqlite of [host.sqlite, target]) {
      const db = createBetterSqliteDbPort(sqlite);
      await applySyncNodesWithDbPort(db, history);
      await collectNodeVersionPayloads(db, 'node-1', Number.MAX_SAFE_INTEGER);
    }
    let head = history.at(-1)!;
    for (let repeat = 0; repeat < 5; repeat++) for (const direction of ['push', 'pull'] as const) {
      const next = branch(`next-${repeat}-${direction}`, 'Changed current body', head);
      await applySyncNodesWithDbPort(createBetterSqliteDbPort(direction === 'push' ? host.sqlite : target), [next]);
      let committedAt = 0;
      const observed = observeTransfer(host, direction);
      const started = performance.now();
      try {
        expect(await host.sync({ onStructureSynced: () => { committedAt = performance.now(); } }))
          .toMatchObject({ remainingStructureChangeCount: 0 });
        expect(observed.snapshot().fullVersions).toEqual([next.version_id]);
        expect(observed.snapshot().bodyBytes).toBe(new TextEncoder().encode('Changed current body').length);
        expect(observed.snapshot().dataBytes).toBeLessThan(10000);
        for (const db of [host.sqlite, target]) {
          expect(db.prepare("SELECT content FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('Changed current body');
          expect(db.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id = 'node-1'").pluck().get())
            .toBe(historySize + repeat * 2 + (direction === 'push' ? 1 : 2));
        }
        samples.push({ direction, repeat, historySize, ...observed.snapshot(),
          databaseConfirmedMs: committedAt - started, roundMs: performance.now() - started, rssBytes: process.memoryUsage().rss });
      } finally { observed.close(); }
      head = next;
    }
    await host.restart();
    expect(host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").pluck().get()).toBe(head.version_id);
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    await mkdir('.tmp/artifacts', { recursive: true });
    await writeFile(`.tmp/artifacts/t359-history-${historySize}.json`, JSON.stringify({
      scope: 'Synthetic production HTTP workload; database callback timing, no native UI timing or speedup claim', samples
    }, null, 2));
  } finally { target.close(); await host.close(); }
}, 180000);

function observeTransfer(host: Awaited<ReturnType<typeof createCompanionRequestFixture>>, direction: 'push' | 'pull') {
  const fullVersions: string[] = [];
  let bodyBytes = 0;
  let inventoryBytes = 0;
  let dataBytes = 0;
  const observe = (fact: CanonicalFact) => {
    if (fact.kind === 2 && fact.blobs.length) fullVersions.push(fact.factId);
  };
  const writeFact = RequestSyncFiles.prototype.writeFact;
  const writeDecoded = RequestSyncFiles.prototype.writeDecodedFact;
  const writeBody = RequestSyncFiles.prototype.writeBody;
  const facts = vi.spyOn(RequestSyncFiles.prototype, 'writeFact').mockImplementation(async function(this: RequestSyncFiles, fact) {
    if (direction === 'push') observe(fact);
    return writeFact.call(this, fact);
  });
  const decoded = vi.spyOn(RequestSyncFiles.prototype, 'writeDecodedFact').mockImplementation(async function(this: RequestSyncFiles, message) {
    if (direction === 'pull') observe(canonicalFactFromValidatedMessage(message));
    return writeDecoded.call(this, message);
  });
  const bodies = vi.spyOn(RequestSyncFiles.prototype, 'writeBody').mockImplementation(async function(this: RequestSyncFiles, blob, bytes) {
    bodyBytes += bytes.length;
    return writeBody.call(this, blob, bytes);
  });
  native.post.mockImplementation(async input => {
    let requestBytes = 0;
    for (let i = 0; i < input.request_chunk_count; i++) {
      requestBytes += (await native.files!.read(`${input.directory}/http-out-${i}`))?.length ?? 0;
    }
    const response = await host.post(input);
    const bytes = requestBytes + response.response_byte_length;
    if (new URL(input.url).searchParams.get('request') === 'inventory') inventoryBytes += bytes;
    else dataBytes += bytes;
    return response;
  });
  return { snapshot: () => ({ fullVersions, bodyBytes, inventoryBytes, dataBytes }),
    close() { facts.mockRestore(); decoded.mockRestore(); bodies.mockRestore(); } };
}
