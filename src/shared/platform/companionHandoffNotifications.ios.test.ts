import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ platform: 'ios', enabled: true }));
const notifications = vi.hoisted(() => ({
  cancel: vi.fn(async () => undefined),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn()
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => native.platform, isNativePlatform: () => native.enabled },
  registerPlugin: () => ({})
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: notifications }));

beforeEach(() => {
  vi.clearAllMocks();
  native.enabled = true;
});

it.each(['ios', 'android'])('cancels both retired notifications on %s without requesting permission or scheduling replacements', async (platform) => {
  native.platform = platform;
  const { cancelRetiredHandoffNotifications } = await import('./companionHandoffNotifications');
  await cancelRetiredHandoffNotifications();
  expect(notifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 420101 }, { id: 420102 }] });
  expect(notifications.schedule).not.toHaveBeenCalled();
  expect(notifications.checkPermissions).not.toHaveBeenCalled();
  expect(notifications.requestPermissions).not.toHaveBeenCalled();
});

it('does not call native notifications from the web shell', async () => {
  native.enabled = false;
  const { cancelRetiredHandoffNotifications } = await import('./companionHandoffNotifications');
  await cancelRetiredHandoffNotifications();
  expect(notifications.cancel).not.toHaveBeenCalled();
});

it('reports cancellation failure so the shell can record it and retry on the next start', async () => {
  notifications.cancel.mockRejectedValueOnce(new Error('native unavailable'));
  const { cancelRetiredHandoffNotifications } = await import('./companionHandoffNotifications');
  await expect(cancelRetiredHandoffNotifications()).rejects.toThrow('native unavailable');
});
