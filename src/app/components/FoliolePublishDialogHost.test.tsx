import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { FoliolePublishDialogHost } from './FoliolePublishDialogHost';

const repository = vi.hoisted(() => ({
  forgetFoliolePublishFieldFromRuntime: vi.fn(),
  previewFoliolePublishFromRuntime: vi.fn(),
  publishTopicToFoliole: vi.fn(),
  resetFoliolePublishFieldHistoryFromRuntime: vi.fn()
}));
const workspace = vi.hoisted(() => ({ updateNodeContent: vi.fn() }));
const notices = vi.hoisted(() => ({ showAppRuntimeNotice: vi.fn() }));
const navigation = vi.hoisted(() => ({ openExternalUrl: vi.fn() }));

vi.mock('../../shared/platform/foliolePublishRepository', () => ({
  ...repository,
  isFoliolePublishConfigured: (settings: { has_credentials?: boolean }) => Boolean(settings.has_credentials)
}));
vi.mock('../../store/workspaceStore', () => ({ useWorkspaceStore: { getState: () => workspace } }));
vi.mock('../../shared/ui/AppRuntimeNotice', () => notices);
vi.mock('../../shared/platform/runtimeExternalNavigation', () => navigation);

async function openDialog(hasCredentials = false, content = '---\ncategory: essays\ntags: [design, notes]\n---\nBody') {
  await act(async () => window.dispatchEvent(new CustomEvent('foliole:web-publish-dialog-request', { detail: {
    content,
    nodeId: 'topic-1',
    settings: {
      account_id: hasCredentials ? 'account' : '', field_catalog: [], has_credentials: hasCredentials,
      pages_url: '', project_name: hasCredentials ? 'site' : '', site_address: '', updated_at: null
    },
    title: 'Topic'
  } })));
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.previewFoliolePublishFromRuntime.mockResolvedValue({ local_path: '/Library/Publish/Preview/index.html', status: 'previewed', updated_content: null, url: null });
  workspace.updateNodeContent.mockResolvedValue(true);
});

it('matches the site taxonomy fields and Topic YAML on first publish', async () => {
  render(<FoliolePublishDialogHost />);
  await openDialog(false);
  expect(await screen.findByDisplayValue('category')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Choose category' })).toHaveTextContent('essays');
  expect(screen.getByDisplayValue('tags')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove design' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove notes' })).toBeVisible();
  expect(screen.queryByText('Single value')).not.toBeInTheDocument();
  expect(screen.queryByText('Multiple values')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Use one value' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await waitFor(() => expect(repository.previewFoliolePublishFromRuntime).toHaveBeenCalledWith(expect.objectContaining({
    fields: [
      { key: 'category', value: 'essays' },
      { key: 'tags', value: ['design', 'notes'] }
    ],
    node_id: 'topic-1'
  })));
  expect(screen.queryByText('Fields')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open theme' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reset theme' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
});

it('keeps empty fields in a confirmed publish binding request', async () => {
  repository.publishTopicToFoliole.mockResolvedValue({
    local_path: '/Library/Publish/Site/index.html', status: 'deployed_and_committed',
    updated_content: '---\nfoliole: {}\n---\nBody', url: 'https://site.example/topics/1/'
  });
  render(<FoliolePublishDialogHost />);
  await openDialog(true, 'Body');
  expect(await screen.findByDisplayValue('category')).toBeVisible();
  expect(screen.getByDisplayValue('tags')).toBeVisible();
  fireEvent.click(await screen.findByRole('button', { name: 'Add field' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { metaKey: true, key: 'Enter' });
  expect(repository.publishTopicToFoliole).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(repository.publishTopicToFoliole).toHaveBeenCalledWith(expect.objectContaining({
    fields: [
      { key: 'category', value: '' },
      { key: 'tags', value: [] },
      { key: 'field_1', value: '' }
    ]
  })));
  expect(workspace.updateNodeContent).toHaveBeenCalled();
});

it('offers to open the published Topic without opening it automatically', async () => {
  repository.publishTopicToFoliole.mockResolvedValue({
    local_path: '/Library/Publish/Site/index.html', status: 'deployed_and_committed',
    updated_content: '---\nfoliole: {}\n---\nBody', url: 'https://site.example/topics/1/'
  });
  render(<FoliolePublishDialogHost />);
  await openDialog(true, 'Body');
  fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));

  await waitFor(() => expect(notices.showAppRuntimeNotice).toHaveBeenCalledWith(
    'Published to the site.', 'success', expect.objectContaining({ label: 'Open topic' })
  ));
  expect(navigation.openExternalUrl).not.toHaveBeenCalled();
  notices.showAppRuntimeNotice.mock.calls[0]?.[2]?.onSelect();
  expect(navigation.openExternalUrl).toHaveBeenCalledWith('https://site.example/topics/1/');
});

it.each([
  ['deployed_history_failed', 'Published, but recent field values could not be saved.'],
  ['deployed_local_publish_state_failed', 'Published, but the local static site could not be updated. The Topic binding was saved so you can retry.']
] as const)('keeps the open action when publishing reports %s', async (status, message) => {
  repository.publishTopicToFoliole.mockResolvedValue({
    local_path: '/Library/Publish/Site/index.html', status,
    updated_content: '---\nfoliole: {}\n---\nBody', url: 'https://site.example/topics/1/'
  });
  render(<FoliolePublishDialogHost />);
  await openDialog(true, 'Body');
  fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));

  await waitFor(() => expect(notices.showAppRuntimeNotice).toHaveBeenCalledWith(
    message, 'error', expect.objectContaining({ label: 'Open topic' })
  ));
  expect(navigation.openExternalUrl).not.toHaveBeenCalled();
  notices.showAppRuntimeNotice.mock.calls.at(-1)?.[2]?.onSelect();
  expect(navigation.openExternalUrl).toHaveBeenCalledWith('https://site.example/topics/1/');
});

it('reports a local Topic binding failure without losing the published URL', async () => {
  repository.publishTopicToFoliole.mockResolvedValue({
    local_path: '/Library/Publish/Site/index.html', status: 'deployed_and_committed',
    updated_content: '---\nfoliole: {}\n---\nBody', url: 'https://site.example/topics/1/'
  });
  workspace.updateNodeContent.mockResolvedValue(false);
  render(<FoliolePublishDialogHost />);
  await openDialog(true, 'Body');
  fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));

  await waitFor(() => expect(notices.showAppRuntimeNotice).toHaveBeenCalledWith(
    'Published, but Foliole could not save the Topic binding.', 'error',
    expect.objectContaining({ label: 'Open topic' })
  ));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(navigation.openExternalUrl).not.toHaveBeenCalled();
  notices.showAppRuntimeNotice.mock.calls.at(-1)?.[2]?.onSelect();
  expect(navigation.openExternalUrl).toHaveBeenCalledWith('https://site.example/topics/1/');
});

it('edits multiple values as removable chips and preserves them when switching to one value', async () => {
  render(<FoliolePublishDialogHost />);
  await openDialog(false);

  const values = await screen.findByRole('textbox', { name: 'Comma-separated values' });
  fireEvent.change(values, { target: { value: 'research' } });
  fireEvent.keyDown(values, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Remove research' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Remove notes' }));
  expect(screen.queryByRole('button', { name: 'Remove notes' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use one value' }));
  expect(screen.getByRole('button', { name: 'Choose tags' })).toHaveTextContent('design, research');
});
