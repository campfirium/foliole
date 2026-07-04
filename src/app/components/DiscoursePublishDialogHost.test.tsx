import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeDiscoursePublishCatalog } from '../../../lib/platform/nativeDiscoursePublishContract';

import { DiscoursePublishDialogHost } from './DiscoursePublishDialogHost';

const discourseRepositoryMocks = vi.hoisted(() => ({
  loadDiscoursePublishCatalogFromRuntime: vi.fn(),
  loadDiscoursePublishSettingsFromRuntime: vi.fn(),
  publishTopicToDiscourse: vi.fn()
}));

vi.mock('../../shared/platform/discoursePublishRepository', () => discourseRepositoryMocks);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function catalog(input: {
  categoryId: number;
  categoryName: string;
  fromCache: boolean;
  tag: string;
}): NativeDiscoursePublishCatalog {
  return {
    categories: [{ id: input.categoryId, name: input.categoryName, parent_category_id: null, slug: input.categoryName }],
    fetched_at: '2026-07-02T00:00:00.000Z',
    from_cache: input.fromCache,
    recent_category_ids: [input.categoryId],
    recent_tags: [input.tag],
    tags: [{ id: input.tag, name: input.tag }]
  };
}

function requestPublishDialog() {
  window.dispatchEvent(new CustomEvent('foliole:discourse-publish-dialog-request', {
    detail: {
      content: '# Cached-first topic\n\nLong enough body for preview.',
      nodeId: 'test-topic',
      title: 'Folder title'
    }
  }));
}

beforeEach(() => {
  discourseRepositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockReset();
  discourseRepositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockReset();
  discourseRepositoryMocks.publishTopicToDiscourse.mockReset();
  discourseRepositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockResolvedValue({
    has_api_key: true,
    site_url: 'https://forum.example.com',
    updated_at: '2026-07-02T00:00:00.000Z'
  });
});

it('shows cached Discourse catalog before replacing it with refreshed forum data', async () => {
  const refresh = deferred<NativeDiscoursePublishCatalog>();
  discourseRepositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockImplementation((input?: { refresh?: boolean }) =>
    input?.refresh
      ? refresh.promise
      : Promise.resolve(catalog({ categoryId: 17, categoryName: 'Cached Category', fromCache: true, tag: 'cached-tag' }))
  );

  render(<DiscoursePublishDialogHost />);
  requestPublishDialog();

  fireEvent.click(await screen.findByRole('button', { name: 'Category' }));
  expect(await screen.findByText('Cached Category')).toBeInTheDocument();
  expect(screen.getByText('cached-tag')).toBeInTheDocument();
  await waitFor(() =>
    expect(discourseRepositoryMocks.loadDiscoursePublishCatalogFromRuntime.mock.calls.map(([input]) => input))
      .toEqual([undefined, { refresh: true }])
  );

  refresh.resolve(catalog({ categoryId: 18, categoryName: 'Fresh Category', fromCache: false, tag: 'fresh-tag' }));

  expect(await screen.findByText('Fresh Category')).toBeInTheDocument();
  expect(screen.getByText('fresh-tag')).toBeInTheDocument();
});
