// @vitest-environment node
import { expect, it } from 'vitest';

import { loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { approveJoiningMobile, createJoiningMobile, mobile,
  syncJoinedMobile } from '../../../../../test/companionJoinedMobile.testSupport.js';

it('finishes adoption after a competing automatic round reports busy, then syncs after reopening', { meta: { calibratedMs: 60_000 } }, async () => {
  const host = await createJoiningMobile();
  let release!: () => void;
  let entered!: () => void;
  const paused = new Promise<void>(resolve => { entered = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const transport = mobile.post.getMockImplementation()!;
  let adoption: Promise<unknown> | undefined;
  try {
    await host.provider.send('batch', { nodes: [{ id: 'adoption-contention', content: 'Provider body' }] });
    mobile.post.mockImplementationOnce(async input => {
      entered();
      await resume;
      return transport(input);
    });
    adoption = approveJoiningMobile(host);
    await Promise.race([paused, adoption.then(() => { throw new Error('adoption_did_not_reach_transport'); })]);
    await expect(syncJoinedMobile(host)).rejects.toThrow('sync_round_busy');
    expect(await loadSyncGroupLocalAdoption(host.db)).not.toBeNull();
    release();
    await adoption;
    expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
    host.reopen();
    expect(await syncJoinedMobile(host)).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(host.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('adoption-contention'))
      .toBe('Provider body');
    expect((await host.provider.send('snapshot')).library.nodesById['adoption-contention']?.content)
      .toBe('Provider body');
  } finally {
    release();
    await adoption?.catch(() => undefined);
    await host.close();
  }
});
