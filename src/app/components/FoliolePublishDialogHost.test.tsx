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

vi.mock('../../shared/platform/foliolePublishRepository', () => ({
  ...repository,
  isFoliolePublishConfigured: (settings: { has_credentials?: boolean }) => Boolean(settings.has_credentials)
}));
vi.mock('../../store/workspaceStore', () => ({ useWorkspaceStore: { getState: () => workspace } }));
vi.mock('../../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));

async function openDialog(hasCredentials = false) {
  await act(async () => window.dispatchEvent(new CustomEvent('foliole:web-publish-dialog-request', { detail: {
    content: '---\ncategory: essays\ntags: [design, notes]\n---\nBody',
    nodeId: 'topic-1',
    settings: {
      account_id: hasCredentials ? 'account' : '', field_catalog: [], has_credentials: hasCredentials,
      pages_url: '', project_name: hasCredentials ? 'site' : '', site_address: '', updated_at: null
    },
    title: 'Card'
  } })));
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.previewFoliolePublishFromRuntime.mockResolvedValue({ local_path: '/Library/Publish/Preview/index.html', status: 'previewed', updated_content: null, url: null });
  workspace.updateNodeContent.mockResolvedValue(true);
});

it('uses Topic YAML as field choices and previews without hosting', async () => {
  render(<FoliolePublishDialogHost />);
  await openDialog(false);
  fireEvent.click(await screen.findByRole('button', { name: /category/u }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await waitFor(() => expect(repository.previewFoliolePublishFromRuntime).toHaveBeenCalledWith(expect.objectContaining({
    fields: [{ key: 'category', value: 'essays' }], node_id: 'topic-1'
  })));
  expect(screen.getByText('Fields')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Open theme' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reset theme' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
});

it('keeps empty fields in a confirmed publish binding request', async () => {
  repository.publishTopicToFoliole.mockResolvedValue({
    local_path: '/Library/Publish/Site/index.html', status: 'deployed_and_committed',
    updated_content: '---\nfoliole: {}\n---\nBody', url: 'https://site.example/cards/1.html'
  });
  render(<FoliolePublishDialogHost />);
  await openDialog(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Add field' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(repository.publishTopicToFoliole).toHaveBeenCalledWith(expect.objectContaining({
    fields: [{ key: 'field_1', value: '' }]
  })));
  expect(workspace.updateNodeContent).toHaveBeenCalled();
});
