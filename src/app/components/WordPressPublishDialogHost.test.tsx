import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { writeWordPressPostBinding } from '../../../lib/core/wordpress/wordpressFrontmatter';

import { WordPressPublishDialogHost } from './WordPressPublishDialogHost';

const repositoryMocks = vi.hoisted(() => ({ publishTopicToWordPress: vi.fn() }));
const workspaceStoreMocks = vi.hoisted(() => ({ updateNodeContent: vi.fn() }));

vi.mock('../../shared/platform/wordpressPublishRepository', () => repositoryMocks);
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
  workspaceStoreMocks.updateNodeContent.mockReset();
  repositoryMocks.publishTopicToWordPress.mockResolvedValue({
    mode: 'created',
    post_id: '123',
    updated_content: '# Post title\n\nBody with binding',
    url: 'https://blog.example.com/post'
  });
  workspaceStoreMocks.updateNodeContent.mockResolvedValue(true);
});

it('shows title, target, create mode, and defaults to Draft', async () => {
  render(<WordPressPublishDialogHost />);
  requestDialog();

  expect(await screen.findByRole('dialog')).toHaveTextContent('Post title');
  expect(screen.getByText('https://blog.example.com')).toBeInTheDocument();
  expect(screen.getByText('Create a new post')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Post status' })).toHaveValue('draft');
});

it('publishes with the selected status and saves the returned binding locally', async () => {
  render(<WordPressPublishDialogHost />);
  requestDialog();
  const status = await screen.findByRole('combobox', { name: 'Post status' });
  fireEvent.change(status, { target: { value: 'publish' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

  await waitFor(() => expect(repositoryMocks.publishTopicToWordPress).toHaveBeenCalledWith({
    content: '# Post title\n\nBody', status: 'publish', title: 'Post title'
  }));
  expect(workspaceStoreMocks.updateNodeContent).toHaveBeenCalledWith('topic-1', '# Post title\n\nBody with binding');
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

  expect(await screen.findByText('Update the connected post')).toBeInTheDocument();
});
