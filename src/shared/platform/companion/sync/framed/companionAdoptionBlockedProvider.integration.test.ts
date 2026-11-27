// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../../../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { loadDesktopSyncGroupRestoreState,
  settleUnreceivableDesktopSyncGroupRestore } from '../../../../../../electron/database/syncGroupRestoreState.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { markSyncGroupRestoreApplied, receiveSyncGroupRestoreEvent } from '../../../../../../lib/core/sync/syncGroupRestoreEvents.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';
import { describeCompanionSyncReceiveIssue } from '../companionSyncReceiveIssue.js';

it('keeps first reception pending while the provider cannot publish, then receives once it can', async () => {
  const host = await createCompanionRequestFixture();
  try {
    const { fixture } = host;
    await fixture.right.seed({ content: 'Provider body', nodeId: 't891-topic', title: 'Provider topic' });
    const setProviderBlocked = async (blocked: boolean) => {
      const source = new Database(fixture.rightSnapshot.databasePath);
      try {
        if (!blocked) source.exec("DELETE FROM sync_group_restore_events WHERE restore_id = 'provider-restore'");
        else await receiveSyncGroupRestoreEvent(createBetterSqliteDbPort(source), { group_id: 't326-group',
          restore_id: 'provider-restore', restored_at: new Date().toISOString(), source_device_identity_key: 'other-device' });
      } finally { source.close(); }
    };
    const received = () => host.sqlite.prepare("SELECT COUNT(*) FROM nodes WHERE id = 't891-topic'").pluck().get();
    await setProviderBlocked(true);
    await beginSyncGroupLocalAdoption(host.db, { endpointUrl: fixture.rightSnapshot.origin, groupId: 't326-group',
      libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`, providerDeviceId: fixture.rightSnapshot.deviceId,
      providerDeviceName: 'Provider', providerPlatform: 'darwin' });

    const failure = await host.sync().then(() => null, error => error);

    expect(describeCompanionSyncReceiveIssue(failure).code).toBe('sync_group_local_adoption_source_unavailable');
    expect(await loadSyncGroupLocalAdoption(host.db)).not.toBeNull();
    expect(received()).toBe(0);

    await setProviderBlocked(false);
    await host.sync();

    expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
    expect(received()).toBe(1);
  } finally { await host.close(); }
}, 30_000);

it('merges both libraries once a computer settles the overwrite a phone published', async () => {
  const host = await createCompanionRequestFixture();
  try {
    const { fixture } = host;
    await fixture.right.seed({ content: 'Computer body', nodeId: 't894-computer', title: 'Computer topic' });
    await fixture.left.seed({ content: 'Phone body', nodeId: 't894-phone', title: 'Phone topic' });
    const event = { group_id: 't326-group', restore_id: 'phone-overwrite', restored_at: new Date().toISOString(),
      source_device_identity_key: fixture.leftSnapshot.deviceId };
    await receiveSyncGroupRestoreEvent(host.db, event);
    await markSyncGroupRestoreApplied(host.db, event);
    const computer = new Database(fixture.rightSnapshot.databasePath);
    try {
      await receiveSyncGroupRestoreEvent(createBetterSqliteDbPort(computer), event);
      await expect(host.sync()).rejects.toThrow();
      computer.prepare("UPDATE sync_group_devices SET platform = 'android-capacitor' WHERE device_identity_key = ?")
        .run(fixture.leftSnapshot.deviceId);
      const driver = createBetterSqlite3Driver(computer);
      settleUnreceivableDesktopSyncGroupRestore(driver,
        loadDesktopSyncGroupRestoreState(driver, 't326-group'), [], new Date().toISOString());
    } finally { computer.close(); }

    await host.sync();

    const ids = "SELECT id FROM nodes WHERE id IN ('t894-computer', 't894-phone') ORDER BY id";
    expect(host.sqlite.prepare(ids).pluck().all()).toEqual(['t894-computer', 't894-phone']);
    const merged = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try { expect(merged.prepare(ids).pluck().all()).toEqual(['t894-computer', 't894-phone']); }
    finally { merged.close(); }
  } finally { await host.close(); }
}, 30_000);
