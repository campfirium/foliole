import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    loadExternalDocument: vi.fn(async () => ({
      document: {
        content: 'cached external content',
        content_status: 'missing',
        document_id: 'folder-1:doc.md',
        extension: 'md',
        file_name: 'doc.md',
        folder_id: 'folder-1',
        opening_text: 'cached external',
        relative_path: 'doc.md',
        title: 'Doc',
        updated_at: '2026-04-26T01:00:00.000Z'
      }
    })),
    searchExternalDocuments: vi.fn(async () => ({
      query: 'external',
      results: [{
        content: 'cached external content',
        content_status: 'ready',
        document_id: 'folder-1:doc.md',
        excerpt: 'cached external content',
        extension: 'md',
        file_name: 'doc.md',
        folder_id: 'folder-1',
        match_start: 7,
        opening_text: 'cached external',
        relative_path: 'doc.md',
        title: 'Doc',
        updated_at: '2026-04-26T01:00:00.000Z'
      }]
    }))
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.platform,
    isNativePlatform: capacitorMock.isNative
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

describe('companion external documents bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    capacitorMock.isNative.mockReturnValue(true);
    capacitorMock.platform.mockReturnValue('android');
  });

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

  it('returns empty values outside native Android runtime', async () => {
    capacitorMock.isNative.mockReturnValue(false);
    const api = await import('./companionExternalDocuments');

    await expect(api.loadCompanionExternalDocument('folder-1:doc.md')).resolves.toBeNull();
    await expect(api.searchCompanionExternalDocuments('external')).resolves.toEqual([]);
  });
});
