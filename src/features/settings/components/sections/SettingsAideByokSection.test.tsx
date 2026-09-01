import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsAideByokSection } from './SettingsAideByokSection';

const runtime = vi.hoisted(() => ({
  disconnect: vi.fn(),
  load: vi.fn(),
  save: vi.fn()
}));

vi.mock('../../../../shared/platform/assistantRuntime', () => ({
  disconnectAssistantByokSettings: runtime.disconnect,
  loadAssistantByokSettings: runtime.load,
  saveAssistantByokSettings: runtime.save
}));

const empty = {
  endpoint: '', has_api_key: false, model: '', state: 'not_configured' as const
};

beforeEach(() => {
  runtime.disconnect.mockReset();
  runtime.load.mockReset();
  runtime.save.mockReset();
  runtime.load.mockResolvedValue(empty);
  runtime.disconnect.mockResolvedValue(empty);
});

it('saves a transient API key and only renders the public configuration', async () => {
  runtime.save.mockResolvedValue({
    endpoint: 'https://models.example/v1/chat/completions',
    has_api_key: true,
    model: 'model-a',
    state: 'configured'
  });
  renderWithLocalization(<SettingsAideByokSection />);

  const endpoint = await screen.findByLabelText('Model API endpoint');
  await waitFor(() => expect(endpoint).toBeEnabled());
  fireEvent.change(endpoint, { target: { value: 'https://models.example/v1/chat/completions' } });
  fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'model-a' } });
  const apiKey = screen.getByLabelText('Model API key');
  fireEvent.input(apiKey, { target: { value: 'secret-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(runtime.save).toHaveBeenCalledWith({
    api_key: 'secret-key',
    endpoint: 'https://models.example/v1/chat/completions',
    model: 'model-a'
  }));
  expect(await screen.findByText('Ready to use in Foliole Aide.')).toBeVisible();
  expect(apiKey).toHaveValue('');
  expect(apiKey).toHaveAttribute('placeholder', '••••••••');
  expect(screen.queryByDisplayValue('secret-key')).toBeNull();
});

it('requires a new key before saving a changed endpoint', async () => {
  runtime.load.mockResolvedValue({
    endpoint: 'https://one.example/v1/chat/completions',
    has_api_key: true,
    model: 'model-a',
    state: 'configured'
  });
  renderWithLocalization(<SettingsAideByokSection />);

  const endpoint = await screen.findByLabelText('Model API endpoint');
  await waitFor(() => expect(endpoint).toBeEnabled());
  fireEvent.change(endpoint, { target: { value: 'https://two.example/v1/chat/completions' } });

  expect(screen.getByText('Enter a new API key when changing the endpoint.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

it('removes the stored configuration without asking the renderer for the key', async () => {
  runtime.load.mockResolvedValue({
    endpoint: 'https://models.example/v1/chat/completions',
    has_api_key: true,
    model: 'model-a',
    state: 'configured'
  });
  renderWithLocalization(<SettingsAideByokSection />);

  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(runtime.disconnect).toHaveBeenCalledOnce());
  expect(screen.getByLabelText('Model API key')).toHaveValue('');
  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
});
