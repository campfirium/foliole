import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { requestAideSettingsDialogOpen } from '../model/aideSettingsDialogRequests';

import { AideSettingsDialogHost } from './AideSettingsDialogHost';

const assistantRuntime = vi.hoisted(() => ({
  deleteAssistantModel: vi.fn(),
  loadAssistantCustomInstructions: vi.fn(),
  loadAssistantModelSettings: vi.fn(),
  loadAssistantStatus: vi.fn(),
  loadAssistantStorageInfo: vi.fn(),
  openAssistantStorageLocation: vi.fn(),
  saveAssistantCustomInstructions: vi.fn(),
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
  assistantRuntime.loadAssistantCustomInstructions.mockResolvedValue({ text: 'Be brief.' });
  assistantRuntime.saveAssistantCustomInstructions.mockImplementation(async (text: string) => ({ text }));
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

it('loads custom instructions, counts characters and saves edits on this device', async () => {
  renderWithLocalization(<AideSettingsDialogHost />);
  act(() => requestAideSettingsDialogOpen());

  const field = await screen.findByRole('textbox', { name: 'Custom instructions' });
  await waitFor(() => expect(field).toHaveValue('Be brief.'));
  expect(field).toHaveAttribute('maxlength', '2000');
  expect(screen.getByText('9 / 2000')).toBeInTheDocument();

  fireEvent.change(field, { target: { value: 'Cite sources.' } });
  expect(screen.getByText('13 / 2000')).toBeInTheDocument();
  fireEvent.blur(field);
  await waitFor(() => expect(assistantRuntime.saveAssistantCustomInstructions).toHaveBeenCalledWith('Cite sources.'));
  expect(assistantRuntime.saveAssistantCustomInstructions).toHaveBeenCalledOnce();
});
