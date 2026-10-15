// @vitest-environment node
import { expect, it } from 'vitest';

import { readDesktopFramedSyncLibraryEvidence } from '../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { createCompanionRequestFixture, native } from '../test/companionRequestSync.testSupport';

it('refuses a manual outbound round while its peer owns an inbound round, then persists both directions after release', async () => {
  const host = await createCompanionRequestFixture();
  const { fixture } = host;
  try {
    const { companionSyncPeerRoundOwner, touchCompanionSyncPeerRound } = await import(
      '../shared/platform/companion/sync/framed/companionSyncPeerRounds');
    await fixture.left.seed({ nodeId: 't326-inbound-mobile', title: 'Mobile', content: 'Mobile edit' });
    await fixture.right.seed({ nodeId: 't326-inbound-desktop', title: 'Desktop', content: 'Desktop edit' });
    const owner = await companionSyncPeerRoundOwner();
    const roundId = crypto.randomUUID();
    const inbound = owner.acceptInbound(fixture.rightSnapshot.deviceId, roundId, true);
    native.post.mockClear();
    await expect(host.sync()).rejects.toThrow('sync_round_busy');
    expect(native.post).not.toHaveBeenCalled();
    expect(inbound.signal.aborted).toBe(false);
    await touchCompanionSyncPeerRound({ library_key: '/fixture', generation_id: 'generation',
      peer_device_id: fixture.rightSnapshot.deviceId, peer_round_id: roundId,
      direction: 'inbound', finish_round: true });
    expect(inbound.signal.aborted).toBe(true);
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 't326-inbound-mobile', content: 'Mobile edit' }),
        expect.objectContaining({ id: 't326-inbound-desktop', content: 'Desktop edit' })
      ]));
    }
  } finally { await host.close(); }
}, 60_000);

it.each([false, true])('prioritizes the waiting manual round over an immediate new inbound, already converged=%s', async converged => {
  const host = await createCompanionRequestFixture();
  const { fixture } = host;
  try {
    const { companionSyncPeerRoundOwner } = await import('../shared/platform/companion/sync/framed/companionSyncPeerRounds');
    const { respondCompanionRequestSync } = await import('../shared/platform/companion/sync/framed/companionRequestSyncResponse');
    await fixture.left.seed({ nodeId: 't326-manual-mobile', title: 'Mobile', content: 'Mobile edit' });
    await fixture.right.seed({ nodeId: 't326-manual-desktop', title: 'Desktop', content: 'Desktop edit' });
    if (converged) await host.sync();
    const owner = await companionSyncPeerRoundOwner();
    const roundId = crypto.randomUUID();
    const inbound = owner.acceptInbound(fixture.rightSnapshot.deviceId, roundId, true);
    let notified!: () => void;
    const waiting = new Promise<void>(resolve => { notified = resolve; });
    const phases: string[] = [];
    const manual = host.sync({ waitForInbound: true, onProgress: progress => {
      phases.push(progress.phase);
      if (progress.phase === 'waiting') notified();
    } });
    await waiting;
    let competing: Promise<unknown> | undefined;
    inbound.signal.addEventListener('abort', () => {
      competing = respondCompanionRequestSync({ library_key: '/fixture', generation_id: 'generation',
        directory: `requests/${crypto.randomUUID()}`, mode: 'inventory',
        group_id: 't326-group', initiator_device_id: fixture.rightSnapshot.deviceId,
        initiator_library_epoch: `${fixture.rightSnapshot.deviceId}-epoch`,
        responder_device_id: fixture.leftSnapshot.deviceId,
        responder_library_epoch: `${fixture.leftSnapshot.deviceId}-epoch`,
        peer_round_id: crypto.randomUUID(), peer_round_mode: 'start' }).catch(error => String(error));
    });
    owner.finishInbound(fixture.rightSnapshot.deviceId, roundId);
    expect(await competing).toContain('sync_round_busy');
    expect(await manual).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(phases).toEqual(expect.arrayContaining(['waiting', 'structure']));
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 't326-manual-mobile', content: 'Mobile edit' }),
        expect.objectContaining({ id: 't326-manual-desktop', content: 'Desktop edit' })
      ]));
    }
  } finally { await host.close(); }
}, 60_000);
