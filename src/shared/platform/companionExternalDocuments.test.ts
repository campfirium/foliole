import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    loadExternalDirectory: vi.fn(async () => ({
      entries: [externalEntry()],
      folders: [{ document_count: 1, folder_path: '/library/two think', id: 'folder-1' }]
    })),
    loadExternalDocument: vi.fn(async () => ({
      document: externalDocument({ content_status: 'missing' })
    })),
    loadSyncIndex: vi.fn(async () => ({ entries: [] as Array<{ object_id: string; object_type: string }> })),
    loadSyncObjects: vi.fn(async () => ({ objects: [] as Array<{ payload_json: string | null }> })),
    searchExternalDocuments: vi.fn(async () => ({
      query: 'external',
      results: [{ ...externalDocument({ content_status: 'ready' }), excerpt: 'cached external content', match_start: 7 }]
    }))
  }
}));

function externalEntry() {
  return {
    absolute_path: 'folder-1:doc.md',
    document_id: 'folder-1:doc.md',
    extension: 'md',
    file_name: 'doc.md',
    folder_id: 'folder-1',
    modified_at: '2026-04-26T01:00:00.000Z',
    opening_text: 'cached external',
    relative_path: 'doc.md',
    title: 'Doc'
  };
}

function externalDocument(overrides: Record<string, string> = {}) {
  return {
    content: 'cached external content',
    document_id: 'folder-1:doc.md',
    extension: 'md',
    file_name: 'doc.md',
    folder_id: 'folder-1',
    opening_text: 'cached external',
    relative_path: 'doc.md',
    title: 'Doc',
    updated_at: '2026-04-26T01:00:00.000Z',
    ...overrides
  };
}

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.platform,
    isNativePlatform: capacitorMock.isNative
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  capacitorMock.isNative.mockReturnValue(true);
  capacitorMock.platform.mockReturnValue('android');
});

describe('companion external documents bridge', () => {
  it('loads and searches cached external documents through the native plugin', async () => {
    const api = await import('./companionExternalDocuments');

    await expect(api.loadCompanionExternalDocument('folder-1:doc.md')).resolves.toMatchObject({
      bodyStatus: 'missing',
      content: 'cached external content',
      document_id: 'folder-1:doc.md'
    });
    expect(capacitorMock.plugin.loadExternalDocument).toHaveBeenCalledWith({ document_id: 'folder-1:doc.md' });

    await expect(api.searchCompanionExternalDocuments('external', 5)).resolves.toEqual([expect.objectContaining({
      bodyStatus: 'ready',
      document_id: 'folder-1:doc.md',
      excerpt: 'cached external content'
    })]);
    expect(capacitorMock.plugin.searchExternalDocuments).toHaveBeenCalledWith({ limit: 5, query: 'external' });
  });

  it('searches synced external documents on iOS without exposing Android-only browsing', async () => {
    capacitorMock.platform.mockReturnValue('ios');
    const api = await import('./companionExternalDocuments');

    await expect(api.searchCompanionExternalDocuments('external', 5)).resolves.toEqual([expect.objectContaining({
      bodyStatus: 'ready',
      document_id: 'folder-1:doc.md'
    })]);
    await expect(api.loadCompanionExternalDocument('folder-1:doc.md')).rejects.toMatchObject({
      code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
      platform: 'ios'
    });
    await expect(api.loadCompanionExternalDirectory()).rejects.toMatchObject({
      code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
      platform: 'ios'
    });
    expect(capacitorMock.plugin.searchExternalDocuments).toHaveBeenCalledWith({ limit: 5, query: 'external' });
    expect(capacitorMock.plugin.loadExternalDocument).not.toHaveBeenCalled();
    expect(capacitorMock.plugin.loadExternalDirectory).not.toHaveBeenCalled();
  });

  it('loads cached external directory folders and documents through the native plugin', async () => {
    const api = await import('./companionExternalDocuments');

    await expect(api.loadCompanionExternalDirectory()).resolves.toEqual({
      entries: [expect.objectContaining({
        absolutePath: 'folder-1:doc.md',
        documentId: 'folder-1:doc.md',
        folderId: 'folder-1',
        relativePath: 'doc.md',
        title: 'Doc'
      })],
      folders: [{
        documentCount: 1,
        folderPath: '/library/two think',
        id: 'folder-1'
      }]
    });
    expect(capacitorMock.plugin.loadExternalDirectory).toHaveBeenCalledWith();
  });
});

describe('companion external directory ordering', () => {
  it('orders cached external folders by synced app settings', async () => {
    capacitorMock.plugin.loadExternalDirectory.mockResolvedValueOnce({
      entries: [],
      folders: [
        { document_count: 1, folder_path: '/library/1act', id: 'folder-1' },
        { document_count: 1, folder_path: '/library/2think', id: 'folder-2' }
      ]
    });
    capacitorMock.plugin.loadSyncIndex.mockResolvedValueOnce({
      entries: [{ object_id: 'user_space:windows:desktop:*:app_settings', object_type: 'setting' }]
    });
    capacitorMock.plugin.loadSyncObjects.mockResolvedValueOnce({
      objects: [{
        payload_json: JSON.stringify({
          key: 'app_settings',
          value_json: JSON.stringify({
            'foliole-external-library-folder-order': JSON.stringify([
              { folderPath: 'library/2think', id: 'folder-2' },
              { folderPath: 'library/1act', id: 'folder-1' }
            ])
          })
        })
      }]
    });
    const api = await import('./companionExternalDocuments');

    await expect(api.loadCompanionExternalDirectory()).resolves.toMatchObject({
      folders: [
        { id: 'folder-2' },
        { id: 'folder-1' }
      ]
    });
  });
});

describe('companion external document body status', () => {
  it('preserves external document fetching and failed body status', async () => {
    capacitorMock.plugin.loadExternalDocument.mockResolvedValueOnce({
      document: externalDocument({ content: '', content_status: 'fetching' })
    });
    capacitorMock.plugin.searchExternalDocuments.mockResolvedValueOnce({
      query: 'external',
      results: [{ ...externalDocument({ content: '', content_status: 'failed' }), excerpt: '', match_start: 0 }]
    });
    const api = await import('./companionExternalDocuments');

    await expect(api.loadCompanionExternalDocument('folder-1:doc.md')).resolves.toMatchObject({
      bodyStatus: 'fetching'
    });
    await expect(api.searchCompanionExternalDocuments('external')).resolves.toEqual([expect.objectContaining({
      bodyStatus: 'failed'
    })]);
  });

  it('returns empty values outside native Android runtime', async () => {
    capacitorMock.isNative.mockReturnValue(false);
    const api = await import('./companionExternalDocuments');

    await expect(api.loadCompanionExternalDocument('folder-1:doc.md')).resolves.toBeNull();
    await expect(api.loadCompanionExternalDirectory()).resolves.toEqual({ entries: [], folders: [] });
    await expect(api.searchCompanionExternalDocuments('external')).resolves.toEqual([]);
  });
});
