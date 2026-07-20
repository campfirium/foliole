import { expect, it, vi } from 'vitest';

const capacitorState = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'ios'),
  isNativePlatform: vi.fn(() => true)
}));
const localNotifications = vi.hoisted(() => ({
  cancel: vi.fn(async () => undefined),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async () => undefined)
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorState,
  registerPlugin: () => ({})
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: localNotifications }));

it('schedules handoff reminders through Local Notifications on iOS', async () => {
  const { scheduleCompanionHandoffReminders } = await import('./companionHandoffNotifications');

  await expect(scheduleCompanionHandoffReminders({
    dirtyCount: 1,
    now: new Date('2026-07-21T08:00:00.000Z'),
    settings: { fixedTime: null, shortDelay: '5' }
  })).resolves.toEqual({ scheduled: 1, status: 'scheduled' });

  expect(capacitorState.getPlatform).toHaveReturnedWith('ios');
  expect(localNotifications.cancel).toHaveBeenCalledTimes(1);
  expect(localNotifications.schedule).toHaveBeenCalledWith({
    notifications: [expect.objectContaining({ id: 420101 })]
  });
});
