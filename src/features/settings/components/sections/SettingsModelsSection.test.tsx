import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsModelsSection } from './SettingsModelsSection';

const assistantRuntime = vi.hoisted(() => ({
  deleteAssistantModel: vi.fn(),
  loadAssistantModelSettings: vi.fn(),
  loadAssistantStatus: vi.fn(),
  saveAssistantModelDraft: vi.fn(),
  selectAssistantModel: vi.fn(),
  startAssistantChatGptLogin: vi.fn(),
  testAssistantModel: vi.fn()
}));

vi.mock('../../../../shared/platform/assistantRuntime', () => assistantRuntime);

beforeEach(() => {
  vi.clearAllMocks();
  assistantRuntime.loadAssistantModelSettings.mockResolvedValue({
    models: [{
      api_key_length: 37,
      endpoint: 'https://models.example/v1/chat/completions',
      has_api_key: true,
      id: 'model-a',
      model: 'model-a',
      state: 'configured'
    }],
    selected_model_id: 'codex'
  });
  assistantRuntime.loadAssistantStatus.mockResolvedValue({
    capabilities: [],
    failure: { category: 'auth_failed' },
    provider: 'codex-app-server',
    state: 'unavailable'
  });
});

it('shows the ChatGPT plan and custom models as exclusive choices without a save action', async () => {
  renderWithLocalization(<SettingsModelsSection />);

  expect(screen.getByText('ChatGPT plan')).toBeInTheDocument();
  expect(await screen.findByDisplayValue('model-a')).toBeInTheDocument();
  expect(await screen.findByText('Not connected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Use ChatGPT plan' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Use model-a' })).not.toBeChecked();
  expect(screen.getAllByRole('button', { name: 'Test' })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add model' })).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Custom model')).not.toBeInTheDocument();
  expect(screen.getByLabelText('API key')).toHaveAttribute('placeholder', '•'.repeat(37));
});

it('does not render a placeholder custom row while saved models are loading', async () => {
  let resolveSettings: ((value: unknown) => void) | undefined;
  assistantRuntime.loadAssistantModelSettings.mockReturnValue(new Promise((resolve) => {
    resolveSettings = resolve;
  }));
  renderWithLocalization(<SettingsModelsSection />);

  expect(screen.queryByPlaceholderText('Custom model')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();

  resolveSettings?.({
    models: [{
      api_key_length: 37,
      endpoint: 'https://models.example/v1/chat/completions',
      has_api_key: true,
      id: 'model-a',
      model: 'model-a',
      state: 'configured'
    }],
    selected_model_id: 'codex'
  });

  expect(await screen.findByDisplayValue('model-a')).toBeInTheDocument();
  expect(screen.getAllByLabelText('Model')).toHaveLength(1);
  expect(screen.queryByPlaceholderText('Custom model')).not.toBeInTheDocument();
});

it('moves the ChatGPT plan from not connected to connected', async () => {
  assistantRuntime.startAssistantChatGptLogin.mockResolvedValue({
    provider: 'codex-app-server',
    state: 'ready'
  });
  assistantRuntime.loadAssistantStatus
    .mockResolvedValueOnce({
      capabilities: [], failure: { category: 'auth_failed' },
      provider: 'codex-app-server', state: 'unavailable'
    })
    .mockResolvedValueOnce({
      capabilities: [{ enabled: true, name: 'sendMessage' }],
      provider: 'codex-app-server', state: 'ready'
    });
  renderWithLocalization(<SettingsModelsSection />);

  fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Connected')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
});

it('shows that ChatGPT connection continues in the browser', async () => {
  assistantRuntime.startAssistantChatGptLogin.mockReturnValue(new Promise(() => undefined));
  renderWithLocalization(<SettingsModelsSection />);

  fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Complete in browser')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Waiting...' })).toBeDisabled();
});
