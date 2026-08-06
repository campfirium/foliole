import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  platform: vi.fn(() => 'ios'),
  plugin: {
    loadMissingAttachmentResource: vi.fn(async () => ({
      resource: { attachment_id: 'att-ios', content_hash: 'hash-ios', size_bytes: 42 }
    })),
    loadMissingAttachmentResources: vi.fn(async () => ({
      resources: [{ attachment_id: 'att-ios', content_hash: 'hash-ios', size_bytes: 42 }]
    }))
  }
}));

vi.mock('./companion/runtime/iosCompanionActiveDatabaseReads', () => ({
  loadIosMissingAttachments: mocks.load
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: mocks.platform,
    isNativePlatform: vi.fn(() => true)
  },
  registerPlugin: vi.fn(() => mocks.plugin)
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockImplementation(async (_limit: number, attachmentId?: string) => (
    attachmentId && attachmentId !== 'att-ios' ? [] : [{ attachment_id: 'att-ios', content_hash: 'hash-ios', size_bytes: 42 }]
  ));
});

it('loads iOS attachment manifests through the shared native contract', async () => {
  const api = await import('./companionAttachmentResourceSync');

  await expect(api.loadCompanionMissingAttachmentResources(4)).resolves.toEqual([
    { attachment_id: 'att-ios', content_hash: 'hash-ios', size_bytes: 42 }
  ]);
  await expect(api.loadCompanionMissingAttachmentResource('att-ios')).resolves.toEqual({
    attachment_id: 'att-ios', content_hash: 'hash-ios', size_bytes: 42
  });
  expect(mocks.load).toHaveBeenNthCalledWith(1, 4);
  expect(mocks.load).toHaveBeenNthCalledWith(2, 1, 'att-ios');
});
