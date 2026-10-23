import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ native: true, setSyncScreenAwake: vi.fn<(args: { active: boolean }) => Promise<void>>(async () => undefined) }));
vi.mock('../../companionBootstrap.js', () => ({ isNativeCompanionRuntime: () => host.native }));
vi.mock('../../companionWorkspaceRuntimeRepository.js', () => ({
  FolioleCompanionSync: { setSyncScreenAwake: host.setSyncScreenAwake }
}));

const awakeStates = () => host.setSyncScreenAwake.mock.calls.map(([args]) => args.active);

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  host.native = true;
  host.setSyncScreenAwake.mockClear();
});
afterEach(() => vi.useRealTimers());

it('keeps the screen on across overlapping and back-to-back rounds, then lets it sleep', async () => {
  const { holdCompanionSyncScreenAwake, SYNC_SCREEN_AWAKE_LINGER_MS } = await import('./companionSyncScreenAwake.js');
  const outer = holdCompanionSyncScreenAwake();
  const inner = holdCompanionSyncScreenAwake();
  inner();
  inner();
  outer();
  await vi.advanceTimersByTimeAsync(SYNC_SCREEN_AWAKE_LINGER_MS - 1);
  const next = holdCompanionSyncScreenAwake();
  next();
  await vi.advanceTimersByTimeAsync(SYNC_SCREEN_AWAKE_LINGER_MS);
  expect(awakeStates()).toEqual([true, false]);
});

it('never fails a round when the host cannot keep the screen on', async () => {
  host.setSyncScreenAwake.mockRejectedValueOnce(new Error('unavailable'));
  const { holdCompanionSyncScreenAwake } = await import('./companionSyncScreenAwake.js');
  expect(() => holdCompanionSyncScreenAwake()()).not.toThrow();
  await vi.runAllTimersAsync();
  expect(awakeStates()).toEqual([true, false]);
});

it('does nothing outside the native companion', async () => {
  host.native = false;
  const { holdCompanionSyncScreenAwake } = await import('./companionSyncScreenAwake.js');
  holdCompanionSyncScreenAwake()();
  await vi.runAllTimersAsync();
  expect(host.setSyncScreenAwake).not.toHaveBeenCalled();
});
