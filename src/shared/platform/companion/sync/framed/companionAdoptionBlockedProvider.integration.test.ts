// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { receiveSyncGroupRestoreEvent } from '../../../../../../lib/core/sync/syncGroupRestoreEvents.js';
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
