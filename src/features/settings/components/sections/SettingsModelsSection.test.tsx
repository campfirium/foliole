import { fireEvent, screen, waitFor } from '@testing-library/react';
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
  expect(screen.getAllByRole('button', { name: 'Test' })).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add model' })).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('Custom model')).toBeInTheDocument();
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

it('saves a custom model draft before testing it', async () => {
  assistantRuntime.saveAssistantModelDraft.mockImplementation(async (input) => ({
    models: [{
      endpoint: input.endpoint, has_api_key: Boolean(input.api_key), id: input.id,
      model: input.model, state: 'not_configured', tool_contract_version: 0
    }],
    selected_model_id: 'codex'
  }));
  assistantRuntime.testAssistantModel.mockResolvedValue({
    settings: {
      models: [{
        endpoint: 'https://models.example/v1/chat/completions',
        has_api_key: true,
        id: 'model-a',
        model: 'model-a',
        state: 'configured'
      }, {
        endpoint: 'https://second.example/v1/chat/completions',
        has_api_key: true,
        id: 'model-b',
        model: 'model-b',
        state: 'configured'
      }],
      selected_model_id: 'codex'
    },
    state: 'ready'
  });
  renderWithLocalization(<SettingsModelsSection />);
  await screen.findByDisplayValue('model-a');

  const modelInputs = screen.getAllByLabelText('Model');
  const endpointInputs = screen.getAllByLabelText('API endpoint');
  const keyInputs = screen.getAllByLabelText('API key');
  fireEvent.change(modelInputs.at(-1) as HTMLInputElement, { target: { value: 'model-b' } });
  fireEvent.change(endpointInputs.at(-1) as HTMLInputElement, {
    target: { value: 'https://second.example/v1/chat/completions' }
  });
  fireEvent.change(keyInputs.at(-1) as HTMLInputElement, { target: { value: 'secret' } });

  await waitFor(() => expect(assistantRuntime.saveAssistantModelDraft).toHaveBeenLastCalledWith(
    expect.objectContaining({
      api_key: 'secret', endpoint: 'https://second.example/v1/chat/completions', model: 'model-b'
    })
  ));
  fireEvent.click(screen.getAllByRole('button', { name: 'Test' }).at(-1) as HTMLButtonElement);

  await waitFor(() => expect(assistantRuntime.testAssistantModel).toHaveBeenCalledWith(expect.objectContaining({
    api_key: 'secret',
    endpoint: 'https://second.example/v1/chat/completions',
    model: 'model-b'
  })));
  expect(await screen.findByText('Connection ready')).toBeInTheDocument();
  expect(screen.getAllByPlaceholderText('Custom model')).toHaveLength(1);
});

it('starts with two visible choices when no custom model has been saved', async () => {
  assistantRuntime.loadAssistantModelSettings.mockResolvedValue({
    models: [], selected_model_id: 'codex'
  });
  renderWithLocalization(<SettingsModelsSection />);

  expect(await screen.findByRole('radio', { name: 'Use ChatGPT plan' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Use Custom model' })).toBeDisabled();
  expect(screen.getByPlaceholderText('Custom model')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add model' })).not.toBeInTheDocument();
});

it('keeps a failed model in the form while leaving it unavailable for selection', async () => {
  assistantRuntime.loadAssistantModelSettings.mockResolvedValue({
    models: [], selected_model_id: 'codex'
  });
  assistantRuntime.testAssistantModel.mockResolvedValue({
    failure: { category: 'auth_failed' },
    settings: {
      models: [{
        endpoint: 'https://failed.example/v1/chat/completions',
        has_api_key: true,
        id: 'failed-model',
        model: 'model-failed',
        state: 'not_configured'
      }],
      selected_model_id: 'codex'
    },
    state: 'failed'
  });
  renderWithLocalization(<SettingsModelsSection />);
  await screen.findByPlaceholderText('Custom model');

  fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-failed' } });
  fireEvent.change(screen.getByLabelText('API endpoint'), {
    target: { value: 'https://failed.example/v1/chat/completions' }
  });
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'bad-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Test' }));

  await waitFor(() => expect(assistantRuntime.testAssistantModel).toHaveBeenCalled());
  expect(await screen.findByDisplayValue('model-failed')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Use model-failed' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove model' })).toBeEnabled();
  expect(screen.getByText('Authentication failed. Check the API key and endpoint.')).toBeInTheDocument();
});
