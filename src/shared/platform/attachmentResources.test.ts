import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';

const capacitorMock = vi.hoisted(() => ({
  convertFileSrc: vi.fn((url: string) => `capacitor://${url}`),
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    resolveAttachmentResource: vi.fn()
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: capacitorMock.convertFileSrc,
    getPlatform: capacitorMock.getPlatform,
    isNativePlatform: capacitorMock.isNativePlatform
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
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
  capacitorMock.plugin.resolveAttachmentResource.mockResolvedValue({
    mime_type: 'image/png',
    resource_url: 'file:///data/user/0/com.foliole.android/files/attachments/hash-1',
    status: 'ready'
  });

  await expect(resolveRuntimeAttachmentResource('asset://att-android-1.png')).resolves.toEqual({
    mime_type: 'image/png',
    resource_url: 'capacitor://file:///data/user/0/com.foliole.android/files/attachments/hash-1',
    status: 'ready'
  });

  expect(capacitorMock.plugin.resolveAttachmentResource).toHaveBeenCalledWith({
    attachment_id: 'att-android-1'
  });
});

it('passes through native Android missing file results', async () => {
  capacitorMock.plugin.resolveAttachmentResource.mockResolvedValue({
    mime_type: 'image/png',
    resource_url: null,
    status: 'missing_file'
  });

  await expect(resolveRuntimeAttachmentResource('asset://att-android-2.png')).resolves.toEqual({
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
    await resolveRuntimeAttachmentResource(`asset://att-android-${index}.png`);
  }

  expect(readAttachmentResourceCacheStats().entries).toBe(512);
  capacitorMock.plugin.resolveAttachmentResource.mockClear();
  await resolveRuntimeAttachmentResource('asset://att-android-0.png');

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
    await resolveRuntimeAttachmentResource(`asset://att-desktop-${index}.png`);
  }

  expect(readAttachmentResourceCacheStats().entries).toBe(512);
  invokeMock.mockClear();
  await resolveRuntimeAttachmentResource('asset://att-desktop-0.png');

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith(NATIVE_COMMANDS.resolveAttachmentResource, {
    attachment_id: 'att-desktop-0'
  });
});

it('rejects ios instead of entering the desktop attachment fallback', async () => {
  capacitorMock.getPlatform.mockReturnValue('ios');
  const invoke = vi.fn();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(resolveRuntimeAttachmentResource('asset://att-ios.png')).rejects.toMatchObject({
    code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
    platform: 'ios'
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('keeps the desktop no-bridge fallback returning null', async () => {
  capacitorMock.isNativePlatform.mockReturnValue(false);
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);

  await expect(resolveRuntimeAttachmentResource('asset://att-desktop-no-bridge.png')).resolves.toBeNull();
});
