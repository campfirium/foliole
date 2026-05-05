import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { resolveRuntimeAttachmentResource } from './attachmentResources';

describe('attachmentResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capacitorMock.getPlatform.mockReturnValue('android');
    capacitorMock.isNativePlatform.mockReturnValue(true);
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
});
