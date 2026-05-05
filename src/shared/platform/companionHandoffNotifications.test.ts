import { beforeEach, describe, expect, it, vi } from 'vitest';

const localNotifications = vi.hoisted(() => ({
  cancel: vi.fn(async () => undefined),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async () => undefined)
}));
const companionBootstrap = vi.hoisted(() => ({
  isNativeCompanionRuntime: vi.fn(() => true)
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: localNotifications
}));

vi.mock('./companionBootstrap', () => companionBootstrap);

function resetNotificationMocks() {
  localNotifications.cancel.mockClear();
  localNotifications.checkPermissions.mockClear();
  localNotifications.requestPermissions.mockClear();
  localNotifications.schedule.mockClear();
  localNotifications.checkPermissions.mockResolvedValue({ display: 'granted' });
  localNotifications.requestPermissions.mockResolvedValue({ display: 'granted' });
  companionBootstrap.isNativeCompanionRuntime.mockReturnValue(true);
}

describe('companion handoff notification timing', () => {
  beforeEach(resetNotificationMocks);

  it('builds short and fixed reminder times from settings', async () => {
    const { buildHandoffReminderNotifications } = await import('./companionHandoffNotifications');
    const notifications = buildHandoffReminderNotifications({
      dirtyCount: 2,
      now: new Date('2026-04-25T17:58:00.000Z'),
      settings: { fixedTime: '18:00', shortDelay: '5' }
    });

    expect(notifications).toHaveLength(2);
    expect(notifications[0].schedule.at.toISOString()).toBe('2026-04-25T18:03:00.000Z');
    expect(notifications[1].schedule.at.getHours()).toBe(18);
    expect(notifications[1].schedule.at.getMinutes()).toBe(0);
  });

  it('moves fixed reminders to tomorrow when the time has passed', async () => {
    const { getNextFixedReminderTime } = await import('./companionHandoffNotifications');
    const nextReminder = getNextFixedReminderTime('18:00', new Date('2026-04-25T18:01:00.000Z'));

    expect(nextReminder?.getHours()).toBe(18);
    expect(nextReminder?.getMinutes()).toBe(0);
    expect(nextReminder?.getDate()).toBe(26);
  });
});

describe('companion handoff notification scheduling', () => {
  beforeEach(resetNotificationMocks);

  it('cancels existing handoff reminders when there is no dirty work', async () => {
    const { scheduleCompanionHandoffReminders } = await import('./companionHandoffNotifications');

    await expect(
      scheduleCompanionHandoffReminders({
        dirtyCount: 0,
        settings: { fixedTime: '18:00', shortDelay: '5' }
      })
    ).resolves.toEqual({ scheduled: 0, status: 'cancelled' });
    expect(localNotifications.cancel).toHaveBeenCalledTimes(1);
    expect(localNotifications.schedule).not.toHaveBeenCalled();
  });

  it('requests permission and schedules reminders only on native companion runtime', async () => {
    localNotifications.checkPermissions.mockResolvedValue({ display: 'prompt' });
    const { scheduleCompanionHandoffReminders } = await import('./companionHandoffNotifications');

    await expect(
      scheduleCompanionHandoffReminders({
        dirtyCount: 1,
        now: new Date('2026-04-25T17:00:00.000Z'),
        settings: { fixedTime: null, shortDelay: '2' }
      })
    ).resolves.toEqual({ scheduled: 1, status: 'scheduled' });

    expect(localNotifications.requestPermissions).toHaveBeenCalledTimes(1);
    expect(localNotifications.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({ id: 420101 })]
    });
  });

  it('does nothing outside native companion runtime', async () => {
    companionBootstrap.isNativeCompanionRuntime.mockReturnValue(false);
    const { scheduleCompanionHandoffReminders } = await import('./companionHandoffNotifications');

    await expect(
      scheduleCompanionHandoffReminders({
        dirtyCount: 1,
        settings: { fixedTime: null, shortDelay: '2' }
      })
    ).resolves.toEqual({ scheduled: 0, status: 'unavailable' });
    expect(localNotifications.cancel).not.toHaveBeenCalled();
  });
});
