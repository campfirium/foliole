import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { writeWordPressPostBinding } from '../../../lib/core/wordpress/wordpressFrontmatter';
import type { NativeWordPressPublishCatalog } from '../../../lib/platform/nativeWordPressPublishContract';

import { WordPressPublishDialogHost } from './WordPressPublishDialogHost';

const repositoryMocks = vi.hoisted(() => ({
  loadWordPressPublishCatalogFromRuntime: vi.fn(),
  publishTopicToWordPress: vi.fn()
}));
const workspaceStoreMocks = vi.hoisted(() => ({ updateNodeContent: vi.fn() }));
const noticeMocks = vi.hoisted(() => ({ showAppRuntimeNotice: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({ openExternalUrl: vi.fn() }));

vi.mock('../../shared/platform/wordpressPublishRepository', () => repositoryMocks);
vi.mock('../../shared/platform/runtimeExternalNavigation', () => navigationMocks);
vi.mock('../../shared/ui/AppRuntimeNotice', () => noticeMocks);
vi.mock('../../store/workspaceStore', () => ({ useWorkspaceStore: { getState: () => workspaceStoreMocks } }));

function requestDialog(content = '# Post title\n\nBody') {
  window.dispatchEvent(new CustomEvent('foliole:wordpress-publish-dialog-request', {
    detail: {
      content,
      nodeId: 'topic-1',
      targetSiteUrl: 'https://blog.example.com',
      title: 'Topic fallback'
    }
  }));
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

function catalog(args: { categoryId: number; categoryName: string; fromCache: boolean; tag: string }): NativeWordPressPublishCatalog {
  return {
    categories: [{ id: args.categoryId, name: args.categoryName, parent_category_id: null, slug: 'category' }],
    fetched_at: '2026-07-24T00:00:00.000Z',
    from_cache: args.fromCache,
    selected_category_id: args.categoryId,
    selected_tags: [args.tag],
    tags: [{ id: args.categoryId + 100, name: args.tag, slug: args.tag }]
  };
}

beforeEach(() => {
  repositoryMocks.publishTopicToWordPress.mockReset();
  repositoryMocks.loadWordPressPublishCatalogFromRuntime.mockReset();
  workspaceStoreMocks.updateNodeContent.mockReset();
  noticeMocks.showAppRuntimeNotice.mockReset();
  navigationMocks.openExternalUrl.mockReset();
  repositoryMocks.loadWordPressPublishCatalogFromRuntime.mockResolvedValue({
    categories: [{ id: 7, name: 'Writing', parent_category_id: null, slug: 'writing' }],
    fetched_at: '2026-07-24T00:00:00.000Z',
    from_cache: false,
    selected_category_id: null,
    selected_tags: [],
    tags: [{ id: 11, name: 'foliole', slug: 'foliole' }]
  });
  repositoryMocks.publishTopicToWordPress.mockResolvedValue({
    mode: 'created',
    post_id: '123',
    updated_content: '# Post title\n\nBody with binding',
    url: 'https://blog.example.com/post'
  });
  workspaceStoreMocks.updateNodeContent.mockResolvedValue(true);
});

it('shows the Discourse-style taxonomy controls without redundant publish metadata', async () => {
  render(<WordPressPublishDialogHost />);
  requestDialog();

  expect(await screen.findByRole('button', { name: 'Category' })).toHaveTextContent('Choose a category');
  expect(screen.getByRole('textbox', { name: 'Tags' })).toBeInTheDocument();
  expect(screen.queryByText('https://blog.example.com')).not.toBeInTheDocument();
  expect(screen.queryByText('Create a new post')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Post status' })).toHaveValue('publish');
});

it('shows catalog loading with a spinner instead of trailing dots', async () => {
  repositoryMocks.loadWordPressPublishCatalogFromRuntime.mockReturnValue(new Promise(() => undefined));
  render(<WordPressPublishDialogHost />);
  act(() => requestDialog());

  const status = await screen.findByRole('status');
  expect(status).toHaveAttribute('aria-busy', 'true');
  expect(status).toHaveTextContent('Loading categories and tags');
  expect(status).not.toHaveTextContent('...');
  expect(status.querySelector('.animate-spin')).not.toBeNull();
});

it('uses cached WordPress taxonomy immediately and keeps publishing available when refresh fails', async () => {
  const refresh = deferred<NativeWordPressPublishCatalog>();
  repositoryMocks.loadWordPressPublishCatalogFromRuntime.mockImplementation((input?: { refresh?: boolean }) =>
    input?.refresh
      ? refresh.promise
      : Promise.resolve(catalog({ categoryId: 7, categoryName: 'Cached Writing', fromCache: true, tag: 'cached-tag' }))
  );
  render(<WordPressPublishDialogHost />);
  requestDialog();

  const category = await screen.findByRole('button', { name: 'Category' });
  expect(category).toHaveTextContent('Cached Writing');
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
  expect(repositoryMocks.loadWordPressPublishCatalogFromRuntime.mock.calls.map(([input]) => input))
    .toEqual([undefined, { refresh: true }]);

  await act(async () => refresh.reject(new Error('offline')));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
});

it('refreshes cached taxonomy without replacing choices edited while the request is in flight', async () => {
  const refresh = deferred<NativeWordPressPublishCatalog>();
  repositoryMocks.loadWordPressPublishCatalogFromRuntime.mockImplementation((input?: { refresh?: boolean }) =>
    input?.refresh
      ? refresh.promise
      : Promise.resolve(catalog({ categoryId: 7, categoryName: 'Cached Writing', fromCache: true, tag: 'cached-tag' }))
  );
  render(<WordPressPublishDialogHost />);
  requestDialog();

  const tags = await screen.findByRole('textbox', { name: 'Tags' });
  fireEvent.change(tags, { target: { value: 'local-edit' } });
  await act(async () => refresh.resolve(
    catalog({ categoryId: 9, categoryName: 'Fresh Writing', fromCache: false, tag: 'fresh-tag' })
  ));

  expect(await screen.findByText('fresh-tag')).toBeVisible();
  expect(tags).toHaveValue('local-edit');
});

it('publishes with the selected status and saves the returned binding locally', async () => {
  render(<WordPressPublishDialogHost />);
  requestDialog();
  const status = await screen.findByRole('combobox', { name: 'Post status' });
  fireEvent.click(await screen.findByRole('button', { name: '1 Writing' }));
  fireEvent.click(screen.getByRole('button', { name: '1 foliole' }));
  fireEvent.change(status, { target: { value: 'publish' } });
  fireEvent.keyDown(screen.getByRole('dialog'), { ctrlKey: true, key: 'Enter' });
  expect(repositoryMocks.publishTopicToWordPress).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

  await waitFor(() => expect(repositoryMocks.publishTopicToWordPress).toHaveBeenCalledWith({
    category: { id: 7, name: 'Writing' },
    content: '# Post title\n\nBody',
    status: 'publish',
    tags: [{ id: 11, name: 'foliole' }],
    title: 'Post title'
  }));
  expect(workspaceStoreMocks.updateNodeContent).toHaveBeenCalledWith('topic-1', '# Post title\n\nBody with binding');
  const action = noticeMocks.showAppRuntimeNotice.mock.calls[0]?.[2];
  expect(action?.label).toBe('View post');
  action?.onSelect();
  expect(navigationMocks.openExternalUrl).toHaveBeenCalledWith('https://blog.example.com/post');
});

it('publishes a newly entered category', async () => {
  render(<WordPressPublishDialogHost />);
  requestDialog();
  fireEvent.click(await screen.findByRole('button', { name: 'Category' }));
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Category' })[0]!, { target: { value: 'Research' } });
  fireEvent.click(screen.getByRole('option', { name: 'Create “Research”' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

  await waitFor(() => expect(repositoryMocks.publishTopicToWordPress).toHaveBeenCalledWith(
    expect.objectContaining({ category: { id: null, name: 'Research' } })
  ));
});

it('shows update mode when the Topic already owns a WordPress post binding', async () => {
  const content = writeWordPressPostBinding('# Post title\n\nChanged', {
    adapter: 'core_rest',
    lastPublishedAt: '2026-07-16T00:00:00.000Z',
    postId: '123',
    site: 'https://blog.example.com',
    url: 'https://blog.example.com/post'
  });
  render(<WordPressPublishDialogHost />);
  requestDialog(content);

  await waitFor(() => expect(repositoryMocks.loadWordPressPublishCatalogFromRuntime).toHaveBeenCalledWith({ post_id: '123' }));
});
