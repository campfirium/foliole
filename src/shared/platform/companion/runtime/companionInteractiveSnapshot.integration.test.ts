// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { createSearchLibrary } from './companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => { library = await createSearchLibrary(1, 32); });
afterEach(async () => { await library.close(); vi.restoreAllMocks(); });
function barrier() {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { wait, release };
}
const title = (db: DbPort) => db.query('SELECT title FROM nodes WHERE id=?', ['000000']);

it('shares committed state while ordinary queued snapshots retain their fresh-read contract', async () => {
  const owner = getIosCompanionDatabaseOwner();
  const entered = barrier(); const gate = barrier();
  const sync = owner.readSnapshot(async db => { await title(db); entered.release(); await gate.wait; });
  await entered.wait;
  let retained!: DbPort;
  let laterCompleted = false;
  try {
    await owner.runWriter(db => db.run("UPDATE nodes SET title='new' WHERE id='000000'"));
    expect(await owner.readInteractiveSnapshot(async db => {
      retained = db;
      await expect(db.run('DELETE FROM nodes')).rejects.toThrow('write_forbidden');
      return title(db);
    })).toEqual([{ title: '000000' }]);
    await expect(title(retained)).rejects.toThrow('snapshot_closed');
    const later = owner.readSnapshot(title).then(rows => { laterCompleted = true; return rows; });
    await Promise.resolve();
    expect(laterCompleted).toBe(false);
    gate.release(); await sync;
    expect(await later).toEqual([{ title: 'new' }]);
  } finally { gate.release(); await sync; }
});

it('keeps a foreground borrower alive when a writer cancels the background scan', async () => {
  const owner = getIosCompanionDatabaseOwner();
  const entered = barrier(); const mainGate = barrier(); const mainReturned = barrier();
  const borrowerEntered = barrier(); const borrowerGate = barrier();
  let settled = false;
  const sync = owner.readBackgroundSnapshot(async db => {
    await title(db); entered.release(); await mainGate.wait; mainReturned.release();
  }).finally(() => { settled = true; });
  const rejected = expect(sync).rejects.toThrow('attachment_scan_foreground_write');
  await entered.wait;
  const reading = owner.readInteractiveSnapshot(async db => {
    expect(await title(db)).toEqual([{ title: '000000' }]);
    borrowerEntered.release(); await borrowerGate.wait;
    return title(db);
  });
  try {
    await borrowerEntered.wait;
    await owner.runWriter(db => db.run("UPDATE nodes SET title='new' WHERE id='000000'"));
    mainGate.release(); await mainReturned.wait;
    expect(settled).toBe(false);
    borrowerGate.release();
    expect(await reading).toEqual([{ title: '000000' }]);
    await rejected;
    expect(await owner.readInteractiveSnapshot(title)).toEqual([{ title: 'new' }]);
  } finally { mainGate.release(); borrowerGate.release(); await Promise.allSettled([sync, reading]); }
});

it('isolates borrower cancellation and retires each caller port while the sync transaction stays open', async () => {
  const owner = getIosCompanionDatabaseOwner();
  const entered = barrier(); const gate = barrier();
  const sync = owner.readSnapshot(async db => {
    await title(db); entered.release(); await gate.wait;
    expect(await title(db)).toEqual([{ title: '000000' }]);
  });
  await entered.wait;
  const cancel = new AbortController();
  try {
    await expect(owner.readInteractiveSnapshot(async db => {
      await title(db); cancel.abort(new Error('foreground_cancelled'));
      await title(db);
    }, cancel.signal)).rejects.toThrow('foreground_cancelled');
    expect(await owner.readInteractiveSnapshot(title)).toEqual([{ title: '000000' }]);
  } finally { gate.release(); await sync; }
});

it('drains both caller lifetimes before closing the native connections', async () => {
  const owner = getIosCompanionDatabaseOwner();
  const entered = barrier(); const mainGate = barrier(); const mainReturned = barrier();
  const borrowerEntered = barrier(); const borrowerGate = barrier();
  const sync = owner.readSnapshot(async db => {
    await title(db); entered.release(); await mainGate.wait; mainReturned.release();
  });
  const syncRejected = expect(sync).rejects.toThrow('owner_closed');
  await entered.wait;
  const reading = owner.readInteractiveSnapshot(async db => {
    await title(db); borrowerEntered.release(); await borrowerGate.wait; await title(db);
  });
  const readingRejected = expect(reading).rejects.toThrow('owner_closed');
  await borrowerEntered.wait;
  const closing = owner.close();
  mainGate.release(); await mainReturned.wait;
  expect(library.database.open).toBe(true);
  borrowerGate.release();
  await Promise.all([syncRejected, readingRejected, closing]);
  expect(library.database.open).toBe(false);
});

it('admits a foreground read when the existing snapshot is still opening', async () => {
  const owner = getIosCompanionDatabaseOwner();
  const opening = barrier(); const openGate = barrier(); const mainGate = barrier();
  const query = library.readonlyQueries.query.bind(library.readonlyQueries);
  vi.spyOn(library.readonlyQueries, 'query').mockImplementation(async (sql, values) => {
    if (sql === 'BEGIN DEFERRED') { opening.release(); await openGate.wait; }
    return query(sql, values);
  });
  const sync = owner.readSnapshot(async db => { await title(db); await mainGate.wait; });
  await opening.wait;
  let rows: unknown;
  const reading = owner.readInteractiveSnapshot(title).then(result => { rows = result; });
  try {
    openGate.release();
    await vi.waitFor(() => expect(rows).toEqual([{ title: '000000' }]));
  } finally { openGate.release(); mainGate.release(); await Promise.all([sync, reading]); }
});
