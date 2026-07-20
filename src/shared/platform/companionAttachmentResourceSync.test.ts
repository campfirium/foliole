import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: mocks.platform,
    isNativePlatform: vi.fn(() => true)
  },
  registerPlugin: vi.fn(() => mocks.plugin)
}));

beforeEach(() => vi.clearAllMocks());

it('loads iOS attachment manifests through the shared native contract', async () => {
  const api = await import('./companionAttachmentResourceSync');

  await expect(api.loadCompanionMissingAttachmentResources(4)).resolves.toEqual([
    { attachment_id: 'att-ios', content_hash: 'hash-ios', size_bytes: 42 }
  ]);
  await expect(api.loadCompanionMissingAttachmentResource('att-ios')).resolves.toEqual({
    attachment_id: 'att-ios', content_hash: 'hash-ios', size_bytes: 42
  });
  expect(mocks.plugin.loadMissingAttachmentResources).toHaveBeenCalledWith({ limit: 4 });
  expect(mocks.plugin.loadMissingAttachmentResource).toHaveBeenCalledWith({ attachment_id: 'att-ios' });
});
