import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeDiscoursePublishCatalog } from '../../../lib/platform/nativeDiscoursePublishContract';

import { DiscoursePublishDialogHost } from './DiscoursePublishDialogHost';

const discourseRepositoryMocks = vi.hoisted(() => ({
  loadDiscoursePublishCatalogFromRuntime: vi.fn(),
  loadDiscoursePublishDraftFromRuntime: vi.fn(),
  loadDiscoursePublishSettingsFromRuntime: vi.fn(),
  publishTopicToDiscourse: vi.fn(),
  saveDiscoursePublishDraftToRuntime: vi.fn()
}));
const workspaceStoreMocks = vi.hoisted(() => ({ updateNodeContent: vi.fn() }));
const runtimeNoticeMocks = vi.hoisted(() => ({ showAppRuntimeNotice: vi.fn() }));
const externalNavigationMocks = vi.hoisted(() => ({ openExternalUrl: vi.fn() }));

vi.mock('../../shared/platform/discoursePublishRepository', () => discourseRepositoryMocks);
vi.mock('../../shared/platform/runtimeExternalNavigation', () => externalNavigationMocks);
vi.mock('../../shared/ui/AppRuntimeNotice', () => runtimeNoticeMocks);
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
    last_published_tags: [input.tag],
    recent_category_ids: [input.categoryId],
    recent_tags: [input.tag, 'historical-tag'],
    tags: [{ id: input.tag, name: input.tag }, { id: 'historical-tag', name: 'historical-tag' }]
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
  discourseRepositoryMocks.loadDiscoursePublishDraftFromRuntime.mockReset();
  discourseRepositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockReset();
  discourseRepositoryMocks.publishTopicToDiscourse.mockReset();
  discourseRepositoryMocks.saveDiscoursePublishDraftToRuntime.mockReset();
  runtimeNoticeMocks.showAppRuntimeNotice.mockReset();
  externalNavigationMocks.openExternalUrl.mockReset();
  workspaceStoreMocks.updateNodeContent.mockReset();
  discourseRepositoryMocks.loadDiscoursePublishSettingsFromRuntime.mockResolvedValue({
    has_api_key: true,
    site_url: 'https://forum.example.com',
    updated_at: '2026-07-02T00:00:00.000Z'
  });
  discourseRepositoryMocks.loadDiscoursePublishDraftFromRuntime.mockResolvedValue(null);
  discourseRepositoryMocks.saveDiscoursePublishDraftToRuntime.mockResolvedValue(null);
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

it('uses catalog defaults and publishes only through the visible publish action', async () => {
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

  fireEvent.keyDown(screen.getByRole('dialog'), { ctrlKey: true, key: 'Enter' });
  expect(discourseRepositoryMocks.publishTopicToDiscourse).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  await waitFor(() =>
    expect(discourseRepositoryMocks.publishTopicToDiscourse).toHaveBeenCalledWith(expect.objectContaining({
      category_id: 17,
      tags: ['cached-tag']
    }))
  );
  expect(workspaceStoreMocks.updateNodeContent).toHaveBeenCalledWith('test-topic', '# Cached-first topic\n\nLong enough body for preview.');
  expect(discourseRepositoryMocks.saveDiscoursePublishDraftToRuntime).toHaveBeenLastCalledWith('test-topic', null);
  const noticeAction = runtimeNoticeMocks.showAppRuntimeNotice.mock.calls.at(-1)?.[2];
  expect(noticeAction).toMatchObject({ label: 'Open topic' });
  noticeAction.onSelect();
  expect(externalNavigationMocks.openExternalUrl).toHaveBeenCalledWith('https://forum.example.com/t/2');
});

it('keeps publishing choices but clears a failed attempt when the dialog is reopened', async () => {
  discourseRepositoryMocks.loadDiscoursePublishCatalogFromRuntime.mockResolvedValue(
    catalog({ categoryId: 17, categoryName: 'Cached Category', fromCache: false, tag: 'cached-tag' })
  );
  discourseRepositoryMocks.publishTopicToDiscourse.mockRejectedValue(
    new Error('Discourse request failed (422): Body is too short')
  );

  render(<DiscoursePublishDialogHost />);
  requestPublishDialog();
  const category = await screen.findByRole('button', { name: 'Category' });
  await waitFor(() => expect(category).toHaveTextContent('Cached Category'));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Body is too short');

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(discourseRepositoryMocks.saveDiscoursePublishDraftToRuntime).toHaveBeenLastCalledWith('test-topic', {
    category_id: 17,
    tags: ['cached-tag']
  });

  discourseRepositoryMocks.loadDiscoursePublishDraftFromRuntime.mockResolvedValue({
    category_id: 17,
    tags: ['cached-tag', 'saved-choice']
  });
  requestPublishDialog();
  expect(await screen.findByText('saved-choice')).toBeInTheDocument();
  expect(screen.queryByText('Body is too short')).not.toBeInTheDocument();
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
