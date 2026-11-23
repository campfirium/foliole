import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { requestAideSettingsDialogOpen } from '../model/aideSettingsDialogRequests';

import { AideSettingsDialogHost } from './AideSettingsDialogHost';

const assistantRuntime = vi.hoisted(() => ({
  deleteAssistantModel: vi.fn(),
  loadAssistantModelSettings: vi.fn(),
  loadAssistantStatus: vi.fn(),
  loadAssistantStorageInfo: vi.fn(),
  openAssistantStorageLocation: vi.fn(),
  saveAssistantModelDraft: vi.fn(),
  selectAssistantModel: vi.fn(),
  startAssistantChatGptLogin: vi.fn(),
  testAssistantModel: vi.fn()
}));

vi.mock('../../../shared/platform/assistantRuntime', () => assistantRuntime);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  assistantRuntime.loadAssistantModelSettings.mockResolvedValue({ models: [], selected_model_id: 'codex' });
  assistantRuntime.loadAssistantStatus.mockResolvedValue({
    capabilities: [],
    provider: 'codex-app-server',
    state: 'ready'
  });
  assistantRuntime.loadAssistantStorageInfo.mockResolvedValue({
    bytes: 2048,
    complete: true,
    issueCount: 0,
    path: '/tmp/aide'
  });
});

it('opens on request with model connections and local conversation data', async () => {
  renderWithLocalization(<AideSettingsDialogHost />);
  expect(screen.queryByRole('dialog')).toBeNull();

  act(() => requestAideSettingsDialogOpen());

  const dialog = await screen.findByRole('dialog', { name: 'Aide settings' });
  expect(within(dialog).getByRole('heading', { name: 'Models and conversations' })).toBeInTheDocument();
  expect(within(dialog).getByRole('navigation', { name: 'Aide settings sections' })).toBeInTheDocument();
  expect(await within(dialog).findByRole('table', { name: /model/i })).toBeInTheDocument();
  expect(await within(dialog).findByText('Local conversation data')).toBeInTheDocument();

  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
