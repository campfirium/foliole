// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { readDesktopFramedSyncLibraryEvidence } from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { isSyncPeerRoundRetryableError } from '../../../../../../lib/core/sync/runSyncPeerRound.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';
import type { CompanionDesktopSyncProgress } from '../../../companionDesktopSyncTypes.js';

const NODES = 60;
let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

async function prepareAdoption() {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  await fixture.right.invoke('seed_complete_inventory', { count: NODES, bodyBytes: 400 });
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin,
    groupId: 't326-group', libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' });
  return host;
}

function receivedCounts(events: CompanionDesktopSyncProgress[]) {
  return events.filter(event => event.phase === 'structure' && event.total !== null);
}

it('reports received and total objects while adopting group data', { meta: { calibratedMs: 20000 } }, async () => {
  const adoption = await prepareAdoption();
  const events: CompanionDesktopSyncProgress[] = [];
  await adoption.sync({ onProgress: progress => { events.push(progress); } });
  const counted = receivedCounts(events);
  expect(counted.length).toBeGreaterThan(1);
  const total = counted[0]!.total!;
  expect(total).toBeGreaterThanOrEqual(NODES);
  expect(counted.every(event => event.total === total)).toBe(true);
  counted.slice(1).forEach((event, index) => expect(event.completed).toBeGreaterThanOrEqual(counted[index]!.completed));
  expect(counted.at(-1)!.completed).toBe(total);
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
});

it('continues an interrupted adoption from the objects already received', { meta: { calibratedMs: 75000 } }, async () => {
  const adoption = await prepareAdoption();
  const first: CompanionDesktopSyncProgress[] = [];
  const controller = new AbortController();
  await expect(adoption.sync({ signal: controller.signal, onProgress: progress => {
    first.push(progress);
    if (progress.phase === 'structure' && progress.total !== null && progress.completed > 0) controller.abort(new Error('request_sync_foreground_ended'));
  } })).rejects.toThrow();
  expect(await loadSyncGroupLocalAdoption(adoption.db)).not.toBeNull();
  const interruptedAt = receivedCounts(first).at(-1)!.completed;
  expect(interruptedAt).toBeGreaterThan(0);

  const second: CompanionDesktopSyncProgress[] = [];
  // The scheduler retries a busy provider round with backoff; the provider still owns the interrupted one briefly.
  for (let attempt = 0; ; attempt += 1) {
    try { await adoption.sync({ onProgress: progress => { second.push(progress); } }); break; }
    catch (error) {
      if (attempt >= 60 || !isSyncPeerRoundRetryableError(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  const resumed = receivedCounts(second);
  expect(resumed[0]!.completed).toBeGreaterThanOrEqual(interruptedAt);
  expect(resumed.at(-1)!.completed).toBe(resumed.at(-1)!.total);
  expect(await loadSyncGroupLocalAdoption(adoption.db)).toBeNull();
  const nodes = readDesktopFramedSyncLibraryEvidence(adoption.fixture.leftSnapshot.databasePath).nodes;
  expect(nodes.filter(node => (node as { id: string }).id.startsWith('t326-complete-'))).toHaveLength(NODES);
});
