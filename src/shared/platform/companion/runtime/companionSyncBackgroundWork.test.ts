import { beforeEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  platform: 'android', active: true,
  leftScreen: new Set<() => void>(), ended: new Set<() => void>(),
  begin: vi.fn<(args: unknown) => Promise<void>>(async () => undefined),
  update: vi.fn<(args: unknown) => Promise<void>>(async () => undefined),
  end: vi.fn(async () => undefined)
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => host.platform } }));
vi.mock('../../companionBootstrap.js', () => ({ isNativeCompanionRuntime: () => true }));
vi.mock('../../appLifecycle.js', () => ({
  readNativeAppActiveState: async () => host.active,
  subscribeNativeAppEnteredBackground: async (listener: () => void) => {
    host.leftScreen.add(listener);
    return () => { host.leftScreen.delete(listener); };
  }
}));
vi.mock('../../companionWorkspaceRuntimeRepository.js', () => ({ FolioleCompanionSync: {
  beginSyncBackgroundWork: host.begin, updateSyncBackgroundWork: host.update, endSyncBackgroundWork: host.end,
  addListener: async (...args: [string, () => void]) => { host.ended.add(args[1]); }
} }));

const load = () => import('./companionSyncBackgroundWork.js');
const leaveScreen = () => { host.active = false; host.leftScreen.forEach(listener => listener()); };
const systemEnds = () => host.ended.forEach(listener => listener());
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  vi.resetModules();
  Object.assign(host, { platform: 'android', active: true });
  host.leftScreen.clear(); host.ended.clear();
  [host.begin, host.update, host.end].forEach(mock => mock.mockClear());
});

it('starts one notification for overlapping work and ends it with the last release', async () => {
  const { holdCompanionSyncBackgroundWork } = await load();
  const outer = holdCompanionSyncBackgroundWork();
  const inner = holdCompanionSyncBackgroundWork();
  inner.report(3, 10);
  inner.release();
  inner.release();
  await settle();
  expect(host.begin).toHaveBeenCalledOnce();
  expect(host.update).toHaveBeenCalledWith(expect.objectContaining({ completed: 3, total: 10 }));
  expect(host.end).not.toHaveBeenCalled();
  outer.release();
  await settle();
  expect(host.end).toHaveBeenCalledOnce();
});

it('keeps running off screen while work is held and stops once it ends away from the screen', async () => {
  const { holdCompanionSyncBackgroundWork, subscribeCompanionSyncLeftScreen } = await load();
  const stop = vi.fn();
  await subscribeCompanionSyncLeftScreen(stop);
  const work = holdCompanionSyncBackgroundWork();
  leaveScreen();
  expect(stop).not.toHaveBeenCalled();
  work.release();
  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
});

it('lets the system end every hold without a stale release ending later work', async () => {
  const { holdCompanionSyncBackgroundWork, isCompanionSyncBackgroundWorkHeld, subscribeCompanionSyncLeftScreen } = await load();
  const stop = vi.fn();
  await subscribeCompanionSyncLeftScreen(stop);
  const stale = holdCompanionSyncBackgroundWork();
  await settle();
  leaveScreen();
  systemEnds();
  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
  host.active = true;
  const next = holdCompanionSyncBackgroundWork();
  stale.release();
  expect(isCompanionSyncBackgroundWorkHeld()).toBe(true);
  next.release();
  expect(isCompanionSyncBackgroundWorkHeld()).toBe(false);
});

it('treats a refused start as ended and still stops a round left off screen', async () => {
  host.begin.mockRejectedValueOnce(new Error('start_not_allowed'));
  const { holdCompanionSyncBackgroundWork, subscribeCompanionSyncLeftScreen } = await load();
  const stop = vi.fn();
  await subscribeCompanionSyncLeftScreen(stop);
  host.active = false;
  holdCompanionSyncBackgroundWork();
  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
});

it('does not hold work outside Android, so leaving the screen stops rounds at once', async () => {
  host.platform = 'ios';
  const { holdCompanionSyncBackgroundWork, subscribeCompanionSyncLeftScreen } = await load();
  const stop = vi.fn();
  await subscribeCompanionSyncLeftScreen(stop);
  holdCompanionSyncBackgroundWork().report(1, 2);
  leaveScreen();
  expect(stop).toHaveBeenCalledOnce();
  expect(host.begin).not.toHaveBeenCalled();
});
