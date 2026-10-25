import { beforeEach, expect, it, vi } from 'vitest';

import { setCompanionFlowGestureRegion } from './companionFlowGestureRegion';

const native = vi.hoisted(() => ({ platform: 'android', available: true, setRegion: vi.fn(async () => {}) }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => native.platform, isNativePlatform: () => native.platform !== 'web',
    isPluginAvailable: () => native.available },
  registerPlugin: () => ({ setFlowGestureRegion: native.setRegion })
}));
const region = { enabled: true, edgeWidth: 24, bandHeight: 160, viewportWidth: 400 };
beforeEach(() => { vi.clearAllMocks(); native.platform = 'android'; native.available = true; });

it('forwards the central edge region and its release through the registered Android bridge', async () => {
  await setCompanionFlowGestureRegion(region);
  await setCompanionFlowGestureRegion({ ...region, enabled: false });
  expect(native.setRegion.mock.calls).toEqual([[region], [{ ...region, enabled: false }]]);
});

it.each(['ios', 'web', 'foliole-browser-preview'])('keeps %s gestures in the renderer', async platform => {
  native.platform = platform;
  await setCompanionFlowGestureRegion(region);
  expect(native.setRegion).not.toHaveBeenCalled();
});

it('rejects a missing Android plugin instead of assuming the system region was reserved', async () => {
  native.available = false;
  await expect(setCompanionFlowGestureRegion(region)).rejects.toThrow();
  expect(native.setRegion).not.toHaveBeenCalled();
});
