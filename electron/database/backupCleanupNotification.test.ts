// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const notificationMocks = vi.hoisted(() => ({
  construct: vi.fn(),
  getPreferredSystemLanguages: vi.fn(() => ['en-US']),
  isSupported: vi.fn(() => true),
  show: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getPreferredSystemLanguages: notificationMocks.getPreferredSystemLanguages },
  Notification: class Notification {
    static isSupported = notificationMocks.isSupported;
    constructor(public options: unknown) {
      notificationMocks.construct(options);
    }
    show() {
      notificationMocks.show();
    }
  }
}));

import { showBackupCleanupNotification } from './backupCleanupNotification.js';

beforeEach(() => {
  vi.clearAllMocks();
  notificationMocks.getPreferredSystemLanguages.mockReturnValue(['en-US']);
  notificationMocks.isSupported.mockReturnValue(true);
});

it('shows one summary notification for a cleanup batch', () => {
  expect(showBackupCleanupNotification({
    capacityDeletedCount: 2,
    deletedCount: 3,
    failedCount: 0,
    policyDeletedCount: 1,
    releasedBytes: 462 * 1024 * 1024
  })).toBe(true);
  expect(notificationMocks.show).toHaveBeenCalledTimes(1);
  expect(notificationMocks.construct).toHaveBeenCalledWith(expect.objectContaining({
    body: 'Retention rules and the backup size limit moved 3 older backups to the system trash.',
    title: 'Older backups moved to trash'
  }));
});

it('does not notify when nothing was deleted or notifications are unavailable', () => {
  expect(showBackupCleanupNotification({
    capacityDeletedCount: 0,
    deletedCount: 0,
    failedCount: 0,
    policyDeletedCount: 0,
    releasedBytes: 0
  })).toBe(false);
  notificationMocks.isSupported.mockReturnValue(false);
  expect(showBackupCleanupNotification({
    capacityDeletedCount: 0,
    deletedCount: 1,
    failedCount: 0,
    policyDeletedCount: 1,
    releasedBytes: 1024
  })).toBe(false);
  expect(notificationMocks.show).not.toHaveBeenCalled();
});

it('reports when an older backup could not be moved to trash', () => {
  expect(showBackupCleanupNotification({
    capacityDeletedCount: 0,
    deletedCount: 0,
    failedCount: 1,
    policyDeletedCount: 0,
    releasedBytes: 0
  })).toBe(true);
  expect(notificationMocks.construct).toHaveBeenCalledWith(expect.objectContaining({
    body: '1 older backup could not be moved to the system trash.',
    title: 'Older backups could not be moved'
  }));
});

it('explains when the latest safety backup keeps storage over the limit', () => {
  expect(showBackupCleanupNotification({
    capacityDeletedCount: 0,
    deletedCount: 0,
    failedCount: 0,
    policyDeletedCount: 0,
    releasedBytes: 0,
    remainingBytesOverLimit: 12 * 1024 * 1024,
    safetySnapshotFloorPreserved: true
  })).toBe(true);
  expect(notificationMocks.construct).toHaveBeenCalledWith(expect.objectContaining({
    body: 'Backup storage remains 12 MB over the limit to keep the latest safety backup.',
    title: 'Backup limit not reached'
  }));
});

it('uses Chinese cleanup copy for Chinese locales', () => {
  notificationMocks.getPreferredSystemLanguages.mockReturnValue(['zh-CN', 'en-US']);
  expect(showBackupCleanupNotification({
    capacityDeletedCount: 0,
    deletedCount: 1,
    failedCount: 0,
    policyDeletedCount: 1,
    releasedBytes: 10 * 1024 * 1024
  })).toBe(true);
  expect(notificationMocks.show).toHaveBeenCalledTimes(1);
  expect(notificationMocks.construct).toHaveBeenCalledWith(expect.objectContaining({
    body: '根据保留规则将 1 份较早的备份移到了系统废纸篓。',
    title: '旧备份已移到废纸篓'
  }));
});

it('uses English when Chinese is secondary, traditional, ambiguous, or absent', () => {
  for (const languages of [['ko-KR', 'zh-CN'], ['zh-TW'], ['zh'], []]) {
    vi.clearAllMocks();
    notificationMocks.getPreferredSystemLanguages.mockReturnValue(languages);
    notificationMocks.isSupported.mockReturnValue(true);

    expect(showBackupCleanupNotification({
      capacityDeletedCount: 0,
      deletedCount: 1,
      failedCount: 0,
      policyDeletedCount: 1,
      releasedBytes: 10 * 1024 * 1024
    })).toBe(true);
    expect(notificationMocks.construct).toHaveBeenCalledWith(expect.objectContaining({
      body: 'Retention rules moved 1 older backup to the system trash.',
      title: 'Older backups moved to trash'
    }));
  }
});

it('does not let notification failures escape into completed backup work', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  notificationMocks.show.mockImplementationOnce(() => {
    throw new Error('notification unavailable');
  });

  expect(showBackupCleanupNotification({
    capacityDeletedCount: 1,
    deletedCount: 1,
    failedCount: 0,
    policyDeletedCount: 0,
    releasedBytes: 10 * 1024 * 1024
  })).toBe(false);
  expect(errorSpy).toHaveBeenCalledWith(
    '[backup] cleanup notification failed',
    expect.objectContaining({ message: 'notification unavailable' })
  );
  errorSpy.mockRestore();
});
