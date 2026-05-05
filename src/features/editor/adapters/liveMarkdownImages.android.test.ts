import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

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

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

vi.mock('../../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

function createAdapterHostWithMissingResourceSync(
  initialContent: string,
  onMissingAttachmentResource: (attachmentId: string) => Promise<void>
) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent, onMissingAttachmentResource });
  return { adapter, host };
}

describe('live markdown image rendering on Android companion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
    capacitorMock.plugin.resolveAttachmentResource.mockResolvedValue({
      mime_type: 'image/png',
      resource_url: 'file:///data/user/0/com.foliole.android/files/attachments/android-hash-1',
      status: 'ready'
    });
  });

  it('resolves internal attachment images to Android WebView file URLs in native companion', async () => {
    const { adapter, host } = createAdapterHost('![Cover](asset://android-hash-1.png)');

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-element')?.getAttribute('src')).toBe(
        'capacitor://file:///data/user/0/com.foliole.android/files/attachments/android-hash-1'
      );
    });
    expect(capacitorMock.plugin.resolveAttachmentResource).toHaveBeenCalledWith({
      attachment_id: 'android-hash-1'
    });

    adapter.destroy();
  });

  it('retries Android image rendering after the caller syncs a missing attachment resource', async () => {
    const syncMissing = vi.fn(async () => undefined);
    capacitorMock.plugin.resolveAttachmentResource
      .mockResolvedValueOnce({
        resource_url: null,
        status: 'missing_file'
      })
      .mockResolvedValueOnce({
        mime_type: 'image/png',
        resource_url: 'file:///data/user/0/com.foliole.android/files/attachments/android-hash-2',
        status: 'ready'
      });

    const { adapter, host } = createAdapterHostWithMissingResourceSync(
      '![Cover](asset://android-hash-2.png)',
      syncMissing
    );

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-element')?.getAttribute('src')).toBe(
        'capacitor://file:///data/user/0/com.foliole.android/files/attachments/android-hash-2'
      );
    });
    expect(syncMissing).toHaveBeenCalledWith('android-hash-2');
    expect(capacitorMock.plugin.resolveAttachmentResource).toHaveBeenCalledTimes(2);

    adapter.destroy();
  });
});
