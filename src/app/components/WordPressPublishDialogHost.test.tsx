import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { writeWordPressPostBinding } from '../../../lib/core/wordpress/wordpressFrontmatter';

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

beforeEach(() => {
  repositoryMocks.publishTopicToWordPress.mockReset();
  repositoryMocks.loadWordPressPublishCatalogFromRuntime.mockReset();
  workspaceStoreMocks.updateNodeContent.mockReset();
  noticeMocks.showAppRuntimeNotice.mockReset();
  navigationMocks.openExternalUrl.mockReset();
  repositoryMocks.loadWordPressPublishCatalogFromRuntime.mockResolvedValue({
    categories: [{ id: 7, name: 'Writing', parent_category_id: null, slug: 'writing' }],
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
  expect(screen.getByRole('combobox', { name: 'Post status' })).toHaveValue('draft');
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

it('publishes with the selected status and saves the returned binding locally', async () => {
  render(<WordPressPublishDialogHost />);
  requestDialog();
  const status = await screen.findByRole('combobox', { name: 'Post status' });
  fireEvent.click(await screen.findByRole('button', { name: '1 Writing' }));
  fireEvent.click(screen.getByRole('button', { name: '1 foliole' }));
  fireEvent.change(status, { target: { value: 'publish' } });
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
