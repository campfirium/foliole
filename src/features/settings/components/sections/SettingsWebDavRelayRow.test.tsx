import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsWebDavRelayRow } from './SettingsWebDavRelayRow';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: () => invoke
}));

it('reports a failed connection, then accepts a corrected WebDAV folder', async () => {
  invoke.mockResolvedValueOnce('http://127.0.0.1:1234/original/')
    .mockRejectedValueOnce(new Error('Not writable'))
    .mockResolvedValueOnce('http://127.0.0.1:1234/relay/');
  renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" />);
  const address = screen.getByRole('textbox', { name: 'WebDAV folder URL' });
  const test = screen.getByRole('button', { name: 'Connect' });
  await waitFor(() => expect(address).toHaveValue('http://127.0.0.1:1234/original/'));

  fireEvent.change(address, { target: { value: 'http://127.0.0.1:1234/missing' } });
  fireEvent.click(test);
  await screen.findByText(/could not read and write/i);

  fireEvent.change(address, { target: { value: 'http://127.0.0.1:1234/relay' } });
  fireEvent.click(test);
  await screen.findByText('WebDAV folder saved.');
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1',
    directory_url: 'http://127.0.0.1:1234/relay'
  });
});

it('tests sign-in, clears the password and distinguishes verification from saving', async () => {
  invoke.mockClear();
  invoke.mockResolvedValueOnce('https://dav.example.test/relay/')
    .mockResolvedValueOnce('https://dav.example.test/relay/');
  renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" />);
  const username = await screen.findByRole('textbox', { name: 'Username' });
  const password = screen.getByLabelText('App password');
  await waitFor(() => expect(username).toBeEnabled());
  fireEvent.change(username, { target: { value: 'test-user' } });
  expect(screen.getByRole('button', { name: 'Test credentials' })).toBeDisabled();
  fireEvent.change(password, { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Test credentials' }));
  await screen.findByText('WebDAV sign-in and folder access verified.');
  expect(password).toHaveValue('');
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1', directory_url: 'https://dav.example.test/relay/',
    credential_test: { username: 'test-user', password: 'test-password' }
  });
  expect(screen.queryByText('WebDAV folder saved.')).not.toBeInTheDocument();
});
