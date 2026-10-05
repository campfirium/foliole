import type { DesktopFramedSyncProductionBenchmarkAdapter } from './desktopFramedSyncProductionBenchmark.js';
import type { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

type Fixture = Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>;
type FixtureState = Readonly<{ itemCount: number; nextIndex: number; peerOrigin: string }>;

const states = new WeakMap<Fixture, FixtureState>();

export function createDesktopFramedSyncProductionBenchmarkAdapter():
DesktopFramedSyncProductionBenchmarkAdapter {
  return {
    async prepare({ fixture, itemCount }) {
      await fixture.left.seedBatch(itemCount);
      states.set(fixture, { itemCount, nextIndex: 0, peerOrigin: fixture.rightSnapshot.origin });
    },
    residentProcessIds({ fixture }) {
      const rightPid = fixture.right.child.pid;
      return rightPid === undefined ? [fixture.leftSnapshot.pid] : [fixture.leftSnapshot.pid, rightPid];
    },
    async stageUntilRestartBoundary({ fixture, itemCount }) {
      const state = requiredState(fixture, itemCount);
      const boundary = Math.max(1, Math.floor(itemCount / 2));
      await fixture.left.synchronizeBatch(state.peerOrigin, benchmarkNodeIds(0, boundary));
      states.set(fixture, { ...state, nextIndex: boundary });
    },
    async restartReceiverAndRecover({ fixture, itemCount }) {
      const state = requiredState(fixture, itemCount);
      const restarted = await fixture.restartRight();
      await fixture.left.synchronizeBatch(
        restarted.snapshot.origin,
        benchmarkNodeIds(state.nextIndex, itemCount)
      );
      states.set(fixture, { ...state, nextIndex: itemCount, peerOrigin: restarted.snapshot.origin });
    }
  };
}

function requiredState(fixture: Fixture, itemCount: number) {
  const state = states.get(fixture);
  if (!state || state.itemCount !== itemCount) throw new Error('production_benchmark_not_prepared');
  return state;
}

function benchmarkNodeIds(start: number, end: number) {
  return Array.from({ length: end - start }, (_, offset) =>
    `t326-benchmark-${String(start + offset).padStart(6, '0')}`);
}
