import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { createTestAttachmentResource } from '../../../test/attachmentResourceTestSupport';

const capacitorMock = vi.hoisted(() => ({
  convertFileSrc: vi.fn((url: string) => `capacitor://${url}`),
  getPlatform: vi.fn(() => 'android'),
  isNativePlatform: vi.fn(() => true),
  plugin: {
    resolveAttachmentResource: vi.fn()
  }
}));
const databaseMock = vi.hoisted(() => ({
  query: vi.fn()
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
vi.mock('../../../shared/platform/companion/runtime/iosCompanionActiveDatabase', () => ({
  queryIosCompanionDatabase: databaseMock.query
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

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  capacitorMock.plugin.resolveAttachmentResource.mockResolvedValue({
    mime_type: 'image/png',
    resource_url: 'file:///data/user/0/com.foliole.android/files/attachments/android-hash-1',
    status: 'ready'
  });
  databaseMock.query.mockResolvedValue([{
    mime_type: 'image/png',
    storage_key: 'attachments/android-hash-1'
  }]);
});

describe('live markdown image rendering on Android companion', () => {
  it('resolves internal attachment images to Android WebView file URLs in native companion', async () => {
    const resource = createTestAttachmentResource({ attachmentId: 'android-hash-1' });
    const { adapter, host } = createAdapterHost(`![Cover](${resource.assetUrl})`);

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-element')?.getAttribute('src')).toBe(
        'capacitor://file:///data/user/0/com.foliole.android/files/attachments/android-hash-1'
      );
    });
    expect(capacitorMock.plugin.resolveAttachmentResource).toHaveBeenCalledWith({
      attachment_id: resource.description.contentHash,
      content_hash: resource.description.contentHash,
      mime_type: 'image/png',
      storage_key: resource.description.storageKey
    });

    adapter.destroy();
  });
});

describe('missing Android attachment rendering', () => {
  it('retries Android image rendering after the caller syncs a missing attachment resource', async () => {
    const resource = createTestAttachmentResource({
      attachmentId: 'android-hash-2',
      contentHash: 'b'.repeat(64)
    });
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
    databaseMock.query.mockResolvedValue([{
      mime_type: 'image/png',
      storage_key: 'attachments/android-hash-2'
    }]);

    const { adapter, host } = createAdapterHostWithMissingResourceSync(
      `![Cover](${resource.assetUrl})`,
      syncMissing
    );

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-element')?.getAttribute('src')).toBe(
        'capacitor://file:///data/user/0/com.foliole.android/files/attachments/android-hash-2'
      );
    });
    expect(syncMissing).toHaveBeenCalledWith(resource.description.contentHash);
    expect(capacitorMock.plugin.resolveAttachmentResource).toHaveBeenCalledTimes(2);

    adapter.destroy();
  });
});
