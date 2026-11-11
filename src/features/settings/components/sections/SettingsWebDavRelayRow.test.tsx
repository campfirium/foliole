import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsWebDavRelayRow } from './SettingsWebDavRelayRow';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('../../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: () => invoke
}));

it('reports a failed connection, then accepts a corrected WebDAV folder', async () => {
  invoke.mockResolvedValueOnce({ directory: 'http://127.0.0.1:1234/original/', credential_directory: null })
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
  await screen.findByText('Connection verified. WebDAV folder saved.');
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1',
    directory_url: 'http://127.0.0.1:1234/relay'
  });
});

it('saves credentials without configuring the anonymous relay and clears the password', async () => {
  invoke.mockClear();
  invoke.mockResolvedValueOnce({ directory: null, credential_directory: 'https://dav.example.test/relay/' })
    .mockResolvedValueOnce('https://dav.example.test/relay/');
  renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" />);
  const username = await screen.findByRole('textbox', { name: 'Username' });
  const password = screen.getByLabelText('WebDAV password');
  await waitFor(() => expect(username).toBeEnabled());
  fireEvent.change(username, { target: { value: 'test-user' } });
  expect(screen.getByRole('button', { name: 'Test and save credentials' })).toBeDisabled();
  fireEvent.change(password, { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Test and save credentials' }));
  await screen.findByText('Connection verified. WebDAV credentials saved securely on this Mac.');
  expect(password).toHaveValue('');
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1', directory_url: 'https://dav.example.test/relay/',
    credentials: { username: 'test-user', password: 'test-password' }
  });
  expect(screen.queryByText('Connection verified. WebDAV folder saved.')).not.toBeInTheDocument();
});

it('creates only on explicit action and can switch to the full URL after a name collision', async () => {
  invoke.mockClear();
  const parent = 'https://dav.example.test/storage/';
  const target = `${parent}Foliole/`;
  invoke.mockResolvedValueOnce({ directory: null, credential_directory: null })
    .mockRejectedValueOnce(new Error('webdav_relay_folder_name_unavailable'))
    .mockResolvedValueOnce(target);
  renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" />);
  const folder = screen.getByRole('textbox', { name: 'New sync folder name (optional)' });
  await waitFor(() => expect(folder).toBeEnabled());
  fireEvent.change(folder, { target: { value: 'Foliole' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Parent WebDAV folder URL' }), { target: { value: parent } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), { target: { value: 'fixture' } });
  const password = screen.getByLabelText('WebDAV password');
  fireEvent.change(password, { target: { value: 'test-password' } });
  fireEvent.keyDown(password, { key: 'Enter' });
  expect(invoke).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Create, test, and save' }));
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1', directory_url: parent, new_folder_name: 'Foliole',
    credentials: { username: 'fixture', password: 'test-password' }
  });
  await screen.findByText(/name may already be in use/);
  fireEvent.change(folder, { target: { value: '' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'WebDAV folder URL' }), { target: { value: target } });
  fireEvent.change(password, { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Test and save credentials' }));
  await screen.findByText('Connection verified. WebDAV credentials saved securely on this Mac.');
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1', directory_url: target, credentials: { username: 'fixture', password: 'test-password' }
  });
});

it('keeps the bound folder fixed while allowing credential updates', async () => {
  invoke.mockResolvedValueOnce({ directory: 'https://dav.example.test/relay/', credential_directory: null });
  renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" bound credentialActive />);
  const address = screen.getByRole('textbox', { name: 'WebDAV folder URL' });
  await waitFor(() => expect(address).toHaveValue('https://dav.example.test/relay/'));
  expect(address).toBeDisabled();
  expect(screen.queryByRole('textbox', { name: 'New sync folder name (optional)' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Username' })).toBeEnabled();
});
