import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';

import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';

vi.mock('../shared/platform/companionRuntimeCapabilities', async (importOriginal) => ({
  ...await importOriginal<typeof import('../shared/platform/companionRuntimeCapabilities')>(),
  getCompanionRuntimeCapability: vi.fn(() => ({ kind: 'web-preview', platform: 'web' }))
}));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it.each([
  { kind: 'ios-native', platform: 'ios' },
  { kind: 'android-native', platform: 'android' }
] as const)('sends feedback from $platform settings only after Send', async (runtime) => {
  vi.mocked(getCompanionRuntimeCapability).mockReturnValue(runtime);
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetchMock);
  renderWithLocalization(renderCompanionSettingsContent({
    onBackToSettingsList: vi.fn(),
    onOpenSyncSettings: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(),
    settingsPage: 'list',
    workspaceSync: { state: { sync_onboarding_status: 'pending' } } as never
  }));

  const entry = screen.getByRole('button', { name: 'Send Feedback' });
  entry.focus();
  fireEvent.click(entry);
  const draft = within(screen.getByRole('dialog', { name: 'Send Feedback' }));
  fireEvent.change(draft.getByRole('textbox', { name: 'Feedback' }), { target: { value: 'Discard this' } });
  fireEvent.click(draft.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
  await waitFor(() => expect(entry).toHaveFocus());

  fireEvent.click(entry);
  const dialog = within(screen.getByRole('dialog', { name: 'Send Feedback' }));
  const message = dialog.getByRole('textbox', { name: 'Feedback' });
  const send = dialog.getByRole('button', { name: 'Send' });
  expect(message).toHaveValue('');
  expect(send).toBeDisabled();
  fireEvent.change(message, { target: { value: 'Feedback from settings' } });
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(send);

  expect(await screen.findByRole('dialog', { name: 'Feedback sent' })).toBeVisible();
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, request] = fetchMock.mock.calls[0]!;
  expect(url).toBe('https://feedback.foliole.app/submit');
  expect(request?.method).toBe('POST');
  expect(JSON.parse(String(request?.body))).toEqual({
    attachments: [],
    contact: '',
    message: 'Feedback from settings',
    metadata: { appVersion: expect.any(String), language: 'en', platform: runtime.platform },
    turnstileToken: ''
  });
});
