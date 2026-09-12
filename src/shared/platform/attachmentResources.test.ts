import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import {
  createTestAttachmentResource,
  registerTestAttachmentResource
} from '../../test/attachmentResourceTestSupport';

const capacitorMock = vi.hoisted(() => ({
  convertFileSrc: vi.fn((url: string) => `capacitor://${url}`),
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    resolveAttachmentResource: vi.fn()
  }
}));
const iosDatabaseMock = vi.hoisted(() => ({
  query: vi.fn(async () => [{ mime_type: 'application/pdf', storage_key: 'hash-ios' }])
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: capacitorMock.convertFileSrc,
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));
vi.mock('./companion/runtime/iosCompanionActiveDatabase', () => ({
  queryIosCompanionDatabase: iosDatabaseMock.query
}));

import {
  readAttachmentResourceCacheStats,
  resetAttachmentResourceResolutionCacheForTest,
  resolveRuntimeAttachmentResource
} from './attachmentResources';
import { getRuntimeInvoke } from './runtimeInvoke';

vi.mock('./runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  vi.mocked(getRuntimeInvoke).mockReset();
  resetAttachmentResourceResolutionCacheForTest();
});

it('resolves native Android attachment file URLs through Capacitor', async () => {
  const resource = createTestAttachmentResource({ attachmentId: 'att-android-1' });
  capacitorMock.plugin.resolveAttachmentResource.mockResolvedValue({
    mime_type: 'image/png',
    resource_url: 'file:///data/user/0/com.foliole.android/files/attachments/hash-1',
    status: 'ready'
  });

  await expect(resolveRuntimeAttachmentResource(resource.assetUrl)).resolves.toEqual({
    mime_type: 'image/png',
    resource_url: 'capacitor://file:///data/user/0/com.foliole.android/files/attachments/hash-1',
    status: 'ready'
  });

  expect(capacitorMock.plugin.resolveAttachmentResource).toHaveBeenCalledWith({
    attachment_id: resource.description.contentHash,
    content_hash: resource.description.contentHash,
    mime_type: 'image/png',
    storage_key: resource.description.storageKey
  });
});

it('passes through native Android missing file results', async () => {
  const resource = registerTestAttachmentResource({ attachmentId: 'att-android-2', contentHash: 'b'.repeat(64) });
  capacitorMock.plugin.resolveAttachmentResource.mockResolvedValue({
    mime_type: 'image/png',
    resource_url: null,
    status: 'missing_file'
  });

  await expect(resolveRuntimeAttachmentResource(resource.assetUrl)).resolves.toEqual({
    mime_type: 'image/png',
    resource_url: null,
    status: 'missing_file'
  });
  expect(capacitorMock.convertFileSrc).not.toHaveBeenCalled();
});

it('bounds Android attachment resource resolution cache entries', async () => {
  capacitorMock.plugin.resolveAttachmentResource.mockImplementation(({ attachment_id }: { attachment_id: string }) =>
    Promise.resolve({
      mime_type: 'image/png',
      resource_url: `file:///attachments/${attachment_id}`,
      status: 'ready'
    })
  );

  for (let index = 0; index < 513; index += 1) {
    const resource = registerTestAttachmentResource({
      attachmentId: `att-android-${index}`,
      contentHash: index.toString(16).padStart(64, '0')
    });
    await resolveRuntimeAttachmentResource(resource.assetUrl);
  }

  expect(readAttachmentResourceCacheStats().entries).toBe(512);
  capacitorMock.plugin.resolveAttachmentResource.mockClear();
  await resolveRuntimeAttachmentResource(createTestAttachmentResource({
    attachmentId: 'att-android-0', contentHash: '0'.repeat(64)
  }).assetUrl);

  expect(capacitorMock.plugin.resolveAttachmentResource).toHaveBeenCalledTimes(1);
});

it('bounds desktop attachment resource resolution cache entries', async () => {
  capacitorMock.isNativePlatform.mockReturnValue(false);
  const invokeMock = vi.fn((_command: string, payload?: Record<string, unknown>) =>
    Promise.resolve({
      mime_type: 'image/png',
      resource_url: `file:///attachments/${String(payload?.attachment_id ?? '')}`,
      status: 'ready'
    })
  );
  const invoke: NativeInvoke = invokeMock;
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  for (let index = 0; index < 513; index += 1) {
    const resource = registerTestAttachmentResource({
      attachmentId: `att-desktop-${index}`,
      contentHash: index.toString(16).padStart(64, '0')
    });
    await resolveRuntimeAttachmentResource(resource.assetUrl);
  }

  expect(readAttachmentResourceCacheStats().entries).toBe(512);
  invokeMock.mockClear();
  const first = createTestAttachmentResource({ attachmentId: 'att-desktop-0', contentHash: '0'.repeat(64) });
  await resolveRuntimeAttachmentResource(first.assetUrl);

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith(NATIVE_COMMANDS.resolveAttachmentResource, {
    storage_key: first.description.storageKey
  });
});

it('resolves native iOS attachment file URLs through Capacitor', async () => {
  const resource = registerTestAttachmentResource({
    attachmentId: 'att-ios',
    contentHash: 'c'.repeat(64),
    mimeType: 'application/pdf'
  });
  capacitorMock.getPlatform.mockReturnValue('ios');
  capacitorMock.plugin.resolveAttachmentResource.mockResolvedValue({
    mime_type: 'application/pdf',
    resource_url: 'file:///var/mobile/Containers/Data/Application/app/Library/Application Support/attachments/hash-ios',
    status: 'ready'
  });
  const invoke = vi.fn();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(resolveRuntimeAttachmentResource(resource.assetUrl)).resolves.toEqual({
    mime_type: 'application/pdf',
    resource_url: 'capacitor://file:///var/mobile/Containers/Data/Application/app/Library/Application Support/attachments/hash-ios',
    status: 'ready'
  });
  expect(capacitorMock.plugin.resolveAttachmentResource).toHaveBeenCalledWith({
    attachment_id: resource.description.contentHash, content_hash: resource.description.contentHash,
    mime_type: 'application/pdf', storage_key: resource.description.storageKey
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('keeps the desktop no-bridge fallback returning null', async () => {
  const resource = registerTestAttachmentResource({ attachmentId: 'att-desktop-no-bridge' });
  capacitorMock.isNativePlatform.mockReturnValue(false);
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);

  await expect(resolveRuntimeAttachmentResource(resource.assetUrl)).resolves.toBeNull();
});
