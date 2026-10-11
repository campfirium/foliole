import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { readNativeAppActiveState, subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { companionFramedFileOwner } from '../shared/platform/companion/runtime/companionFramedPayloadBudget';
import { openRequestSnapshotFixture, snapshotProbeRecord } from '../shared/platform/companion/runtime/requestSnapshotFixture';
import { createCompanionFramedSyncFiles } from '../shared/platform/companion/sync/framed/companionFramedSyncFiles';
import { withCompanionRequestSyncLifecycle } from '../shared/platform/companion/sync/framed/companionRequestSyncLifecycle';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { requireValue } from './capacityAcceptanceSafety';

export async function runRequestSnapshotProbe(platform: 'android' | 'ios', phase: (value: string) => void) {
  const fixture = await openRequestSnapshotFixture(platform);
  const { owner } = fixture;
  const files = createCompanionFramedSyncFiles(FolioleCompanionSync, companionFramedFileOwner(owner));
  const writeTimes: number[] = [];
  const generate = createSnapshotGenerator(owner, files, phase, writeTimes);
  let stopForeground: (() => void) | undefined;
  try {
    phase('concurrent-write');
    const original = await generate(48, false);
    requireValue(original.length === 48 && !original.includes('snapshot-v48'), 'Snapshot mixed revisions');
    phase('prepare-cancellation');
    const foreground = await observeNextForeground();
    stopForeground = foreground.close;
    let cancelled = false;
    try { await generate(49, true); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== 'request_sync_foreground_ended') throw error;
      cancelled = true;
    }
    requireValue(cancelled, 'Background did not cancel the production request');
    requireValue((await files.list('requests')).length === 0, 'Request files retained after cancellation');
    const checkpoint = await owner.runWriter(db => db.query('PRAGMA wal_checkpoint(TRUNCATE)'));
    requireValue(checkpoint[0]?.busy === 0 && checkpoint[0]?.log === 0, 'Readonly snapshot retained after cancellation');
    phase('cancelled');
    await foreground.active;
    phase('recover');
    const recovered = await generate(null, false);
    requireValue(recovered.length === 50 && recovered.includes('snapshot-v49'), 'Foreground recovery missed committed versions');
    requireValue((await files.list('requests')).length === 0, 'Request files retained after recovery');
    return { originalVersions: original.length, recoveredVersions: recovered.length, cancelled, checkpoint, writeTimes };
  } finally { stopForeground?.(); await fixture.close(); }
}

async function observeNextForeground() {
  let ready!: () => void;
  let failed!: (error: unknown) => void;
  const resumed = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
  const check = () => { void readNativeAppActiveState().then(active => { if (active) ready(); }, failed); };
  const unsubscribe = await subscribeNativeAppForeground(check);
  return { active: resumed, close: unsubscribe };
}

function createSnapshotGenerator(owner: Awaited<ReturnType<typeof openRequestSnapshotFixture>>['owner'],
  files: ReturnType<typeof createCompanionFramedSyncFiles>, phase: (value: string) => void, writeTimes: number[]) {
  return async (nextVersion: number | null, background: boolean) => withCompanionRequestSyncLifecycle(async signal => {
    const object = { globalId: 'snapshot-topic', objectType: 'node' };
    const entry = await owner.readSnapshot(db => readFramedSyncInventoryEntry(db, object), signal);
    requireValue(entry, 'Missing source inventory');
    const difference = compareFramedSyncInventories({ local: [entry], remote: [] })[0];
    requireValue(difference, 'Missing source difference');
    let crossed = false;
    const temporaryFiles = { ...files, write: async (key: string, bytes: Uint8Array) => {
      await files.write(key, bytes);
      if (crossed || nextVersion === null) return;
      crossed = true;
      const started = performance.now();
      await owner.runWriter(db => applySyncNodesWithDbPort(db, [snapshotProbeRecord(nextVersion)], { enqueueSearchInvalidations: false }));
      writeTimes.push(performance.now() - started);
      if (background) {
        phase('await-background');
        await new Promise<void>(resolve => {
          if (signal.aborted) resolve();
          else signal.addEventListener('abort', () => resolve(), { once: true });
        });
        signal.throwIfAborted();
      }
    } };
    return withRequestSyncFiles(temporaryFiles, async request => {
      await owner.readSnapshot(db => writeRequestSyncSnapshot(db, difference, request), signal);
      const versions: string[] = [];
      for await (const fact of request.readFacts()) {
        if (fact.kind !== 2) continue;
        versions.push(fact.factId);
        for (const blob of fact.blobs) await request.loadBody(blob);
      }
      requireValue(nextVersion === null || crossed, 'Request did not exercise scratch writes');
      return versions;
    }, signal);
  });
}
