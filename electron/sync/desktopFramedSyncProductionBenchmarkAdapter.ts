import { z } from 'zod';

import type { DesktopFramedSyncProductionBenchmarkAdapter } from './desktopFramedSyncProductionBenchmark.js';
import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import type { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopFramedSyncFaultProxy } from './desktopFramedSyncTwoProcessFaultProxy.js';

type Fixture = Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>;
type Wire = Readonly<{ sessionBytes: number; transferBytes: number }>;
type FixtureState = Readonly<{ itemCount: number; wire: Wire }>;

const states = new WeakMap<Fixture, FixtureState>();

export function createDesktopFramedSyncProductionBenchmarkAdapter():
DesktopFramedSyncProductionBenchmarkAdapter {
  return {
    async prepare({ fixture, itemCount }) {
      await fixture.left.seedBatch(itemCount);
      states.set(fixture, { itemCount, wire: { sessionBytes: 0, transferBytes: 0 } });
    },
    residentProcessIds({ fixture }) {
      const rightPid = fixture.right.child.pid;
      return rightPid === undefined ? [fixture.leftSnapshot.pid] : [fixture.leftSnapshot.pid, rightPid];
    },
    async stageUntilRestartBoundary({ fixture, itemCount }) {
      requiredState(fixture, itemCount);
      await fixture.right.invoke('round', { input: { kind: 'pause_before_apply' } });
      try {
        await reconcileMeasured(fixture, fixture.rightSnapshot, itemCount);
      } catch (error) {
        if (error instanceof Error && error.message.includes('fixture_paused_before_apply')) return;
        throw error;
      }
      throw new Error('benchmark_receiver_did_not_pause');
    },
    async restartReceiverAndRecover({ fixture, itemCount }) {
      requiredState(fixture, itemCount);
      const restarted = await fixture.restartRight();
      z.object({ complete: z.literal(true), pending: z.literal(0) }).parse(
        await reconcileMeasured(fixture, restarted.snapshot, itemCount)
      );
    },
    wireBytes({ fixture, itemCount }) { return requiredState(fixture, itemCount).wire; }
  };
}

async function reconcileMeasured(fixture: Fixture, peer: Fixture['rightSnapshot'], itemCount: number) {
  const proxy = await createDesktopFramedSyncFaultProxy({ fault: 'observe', targetOrigin: peer.origin });
  try {
    return await reconnectFixturePeer(fixture.left, { ...peer, origin: proxy.origin });
  } finally {
    await proxy.close();
    const state = requiredState(fixture, itemCount);
    const wire = proxy.wireBytes();
    states.set(fixture, { itemCount, wire: {
      sessionBytes: state.wire.sessionBytes + wire.sessionBytes,
      transferBytes: state.wire.transferBytes + wire.transferBytes
    } });
  }
}

function requiredState(fixture: Fixture, itemCount: number) {
  const state = states.get(fixture);
  if (!state || state.itemCount !== itemCount) throw new Error('production_benchmark_not_prepared');
  return state;
}
