import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeDiscoursePublishCatalog } from '../../../lib/platform/nativeDiscoursePublishContract';

import { DiscoursePublishDialogHost } from './DiscoursePublishDialogHost';

const discourseRepositoryMocks = vi.hoisted(() => ({
  loadDiscoursePublishCatalogFromRuntime: vi.fn(),
  loadDiscoursePublishSettingsFromRuntime: vi.fn(),
  publishTopicToDiscourse: vi.fn()
}));
const workspaceStoreMocks = vi.hoisted(() => ({ updateNodeContent: vi.fn() }));

vi.mock('../../shared/platform/discoursePublishRepository', () => discourseRepositoryMocks);
vi.mock('../../store/workspaceStore', () => ({ useWorkspaceStore: { getState: () => workspaceStoreMocks } }));

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
  workspaceStoreMocks.updateNodeContent.mockReset();
  discourseRepositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockResolvedValue({
    has_api_key: true,
    site_url: 'https://forum.example.com',
    updated_at: '2026-07-02T00:00:00.000Z'
  });
  workspaceStoreMocks.updateNodeContent.mockResolvedValue(true);
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

  const category = await screen.findByRole('button', { name: 'Category' });
  fireEvent.click(category);
  await waitFor(() => expect(category).toHaveTextContent('Cached Category'));
  expect(screen.getAllByText('cached-tag').length).toBeGreaterThan(0);
  await waitFor(() =>
    expect(discourseRepositoryMocks.loadDiscoursePublishCatalogFromRuntime.mock.calls.map(([input]) => input))
      .toEqual([undefined, { refresh: true }])
  );

  refresh.resolve(catalog({ categoryId: 18, categoryName: 'Fresh Category', fromCache: false, tag: 'fresh-tag' }));

  await waitFor(() => expect(category).toHaveTextContent('Fresh Category'));
  expect(screen.getAllByText('fresh-tag').length).toBeGreaterThan(0);
});

it('uses catalog defaults and publishes only through the publish shortcut', async () => {
  discourseRepositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockResolvedValue(
    catalog({ categoryId: 17, categoryName: 'Cached Category', fromCache: false, tag: 'cached-tag' })
  );
  discourseRepositoryMocks.publishTopicToDiscourse.mockResolvedValue({
    mode: 'created',
    post_id: 1,
    topic_id: 2,
    updated_content: '# Cached-first topic\n\nLong enough body for preview.',
    url: 'https://forum.example.com/t/2'
  });

  render(<DiscoursePublishDialogHost />);
  requestPublishDialog();

  const category = await screen.findByRole('button', { name: 'Category' });
  await waitFor(() => expect(category).toHaveTextContent('Cached Category'));
  expect(screen.getAllByText('cached-tag').length).toBeGreaterThan(0);

  fireEvent.keyDown(category, { ctrlKey: true, key: 'Enter' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  await waitFor(() =>
    expect(discourseRepositoryMocks.publishTopicToDiscourse).toHaveBeenCalledWith(expect.objectContaining({
      category_id: 17,
      tags: ['cached-tag']
    }))
  );
  expect(workspaceStoreMocks.updateNodeContent).toHaveBeenCalledWith('test-topic', '# Cached-first topic\n\nLong enough body for preview.');
});

it('keeps plain Enter scoped to the focused category control', async () => {
  discourseRepositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockResolvedValue(
    catalog({ categoryId: 17, categoryName: 'Cached Category', fromCache: false, tag: 'cached-tag' })
  );

  render(<DiscoursePublishDialogHost />);
  requestPublishDialog();

  const category = await screen.findByRole('button', { name: 'Category' });
  await waitFor(() => expect(category).toHaveTextContent('Cached Category'));

  fireEvent.keyDown(category, { key: 'Enter' });
  expect(discourseRepositoryMocks.publishTopicToDiscourse).not.toHaveBeenCalled();
  expect(await screen.findByRole('listbox')).toBeInTheDocument();
});
