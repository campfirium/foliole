import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../../lib/core/database/fullTextSearchIndexStrategy';

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    loadSyncIndex: vi.fn(async () => ({ entries: [] as Array<{ object_id: string; object_type: string }> })),
    loadSyncObjects: vi.fn(async () => ({ objects: [] as Array<{ payload_json: string | null }> })),
    searchExternalDocuments: vi.fn(async () => ({
      query: 'alpha',
      results: [{
        content: 'external body',
        content_status: 'failed',
        document_id: 'folder-1:doc.md',
        excerpt: 'external body',
        extension: 'md',
        file_name: 'doc.md',
        folder_id: 'folder-1',
        match_start: 0,
        opening_text: 'external',
        relative_path: 'doc.md',
        title: 'External Topic',
        updated_at: '2026-04-26T01:00:00.000Z'
      }]
    })),
    searchPdfPageText: vi.fn(async () => ({
      query: 'alpha',
      results: [{
        attachment_id: 'pdf-1',
        excerpt: 'pdf body',
        match_start: 2,
        page: 3,
        page_height: null,
        page_width: null,
        text: 'pdf body'
      }]
    })),
    searchTopics: vi.fn(async () => ({
      query: 'alpha',
      results: [{
        content_status: 'missing',
        excerpt: 'topic body',
        match_start: 4,
        node_id: 'topic-1',
        opening_text: 'topic opening',
        title: 'Topic One',
        updated_at: '2026-04-26T01:00:00.000Z'
      }]
    }))
  }
}));

const iosReads = vi.hoisted(() => ({
  external: vi.fn(),
  index: vi.fn(async (): Promise<Array<{ object_id: string; object_type: string }>> => []),
  objects: vi.fn(async (): Promise<Array<{ payload_json: string | null }>> => []),
  pdf: vi.fn(),
  topics: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.platform,
    isNativePlatform: capacitorMock.isNative
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

vi.mock('./companion/runtime/iosCompanionActiveDatabaseReads', () => ({
  loadIosSyncIndex: iosReads.index,
  loadIosSyncObjects: iosReads.objects,
  searchIosExternalDocuments: iosReads.external,
  searchIosPdfPageText: iosReads.pdf,
  searchIosTopics: iosReads.topics
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  capacitorMock.isNative.mockReturnValue(true);
  capacitorMock.platform.mockReturnValue('android');
  capacitorMock.plugin.loadSyncIndex.mockResolvedValue({ entries: [] });
  capacitorMock.plugin.loadSyncObjects.mockResolvedValue({ objects: [] });
  iosReads.index.mockResolvedValue([]);
  iosReads.objects.mockResolvedValue([]);
  iosReads.external.mockResolvedValue([{
    content: 'external body', content_status: 'failed', document_id: 'folder-1:doc.md', excerpt: 'external body',
    extension: 'md', file_name: 'doc.md', folder_id: 'folder-1', match_start: 0, opening_text: 'external',
    relative_path: 'doc.md', title: 'External Topic', updated_at: '2026-04-26T01:00:00.000Z'
  }]);
  iosReads.pdf.mockResolvedValue([{
    attachment_id: 'pdf-1', excerpt: 'pdf body', match_start: 2, page: 3, page_height: null, page_width: null, text: 'pdf body'
  }]);
  iosReads.topics.mockResolvedValue([{
    content_status: 'missing', excerpt: 'topic body', match_start: 4, node_id: 'topic-1', opening_text: 'topic opening',
    title: 'Topic One', updated_at: '2026-04-26T01:00:00.000Z'
  }]);
});

async function expectIosCompleteSearch() {
  capacitorMock.platform.mockReturnValue('ios');
  iosReads.index.mockResolvedValueOnce([
    { object_id: 'user_space:windows:desktop:*:app_settings', object_type: 'setting' }
  ]);
  iosReads.objects.mockResolvedValueOnce([{
      payload_json: JSON.stringify({
        key: 'app_settings',
        value_json: JSON.stringify({ [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'cjk-trigram' })
      })
  }]);
  const api = await import('./companionFullTextSearch');

  await expect(api.searchCompanionFullText('alpha', 5)).resolves.toEqual({
    external: [expect.objectContaining({ bodyStatus: 'failed', document_id: 'folder-1:doc.md' })],
    pdf: [expect.objectContaining({ attachment_id: 'pdf-1', page: 3 })],
    strategy: 'cjk-trigram',
    topics: [expect.objectContaining({ nodeId: 'topic-1', title: 'Topic One' })]
  });
  expect(iosReads.topics).toHaveBeenCalledWith('alpha', 5);
  expect(iosReads.pdf).toHaveBeenCalledWith('alpha', 5);
  expect(iosReads.external).toHaveBeenCalledWith('alpha', 5);
}

describe('companion full text search', () => {
  it('searches topic, PDF, and external local materials through the native plugin', async () => {
    const api = await import('./companionFullTextSearch');

    await expect(api.searchCompanionFullText(' alpha ', 5)).resolves.toEqual({
      external: [expect.objectContaining({ bodyStatus: 'failed', document_id: 'folder-1:doc.md' })],
      pdf: [expect.objectContaining({ attachment_id: 'pdf-1', page: 3 })],
      strategy: 'word-based',
      topics: [expect.objectContaining({ bodyStatus: 'missing', nodeId: 'topic-1', title: 'Topic One' })]
    });
    expect(iosReads.topics).toHaveBeenCalledWith('alpha', 5);
    expect(iosReads.pdf).toHaveBeenCalledWith('alpha', 5);
    expect(iosReads.external).toHaveBeenCalledWith('alpha', 5);
  });

  it('loads the full-text search language from synced app settings', async () => {
    iosReads.index.mockResolvedValueOnce([
      { object_id: 'user_space:windows:desktop:*:app_settings', object_type: 'setting' }
    ]);
    iosReads.objects.mockResolvedValueOnce([{
        payload_json: JSON.stringify({
          key: 'app_settings',
          value_json: JSON.stringify({ [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'cjk-trigram' })
        })
      }
    ]);
    const api = await import('./companionFullTextSearch');

    await expect(api.loadCompanionFullTextSearchStrategy()).resolves.toBe('cjk-trigram');
  });

  it('keeps native search available when synced app settings cannot be read', async () => {
    iosReads.index.mockResolvedValueOnce([
      { object_id: 'user_space:windows:desktop:*:app_settings', object_type: 'setting' }
    ]);
    iosReads.objects.mockRejectedValueOnce(new Error('no such function: json_object'));
    const api = await import('./companionFullTextSearch');

    await expect(api.searchCompanionFullText('alpha', 5)).resolves.toEqual({
      external: [expect.objectContaining({ bodyStatus: 'failed', document_id: 'folder-1:doc.md' })],
      pdf: [expect.objectContaining({ attachment_id: 'pdf-1', page: 3 })],
      strategy: 'word-based',
      topics: [expect.objectContaining({ bodyStatus: 'missing', nodeId: 'topic-1', title: 'Topic One' })]
    });
  });

  it('searches all synced reading material through the native bridge on iOS', expectIosCompleteSearch);

  it('returns empty results outside native hosts or for an empty query', async () => {
    const api = await import('./companionFullTextSearch');

    await expect(api.searchCompanionFullText('   ')).resolves.toEqual({
      external: [],
      pdf: [],
      strategy: 'word-based',
      topics: []
    });
    capacitorMock.isNative.mockReturnValue(false);
    await expect(api.searchCompanionFullText('alpha')).resolves.toEqual({
      external: [],
      pdf: [],
      strategy: 'word-based',
      topics: []
    });
  });
});
