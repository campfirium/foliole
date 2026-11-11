import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsWebDavRelayRow } from './SettingsWebDavRelayRow';

const { invoke, draftInvoke } = vi.hoisted(() => ({ invoke: vi.fn(), draftInvoke: vi.fn() }));
const parent = 'https://dav.example.test/storage/';
const credentials = { username: 'fixture', password: 'test-password' };

vi.mock('../../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: () => (command: string, args: unknown) =>
    command.endsWith('_webdav_setup_draft') ? draftInvoke(command, args) : invoke(command, args)
}));

function fillCredentials() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), { target: { value: credentials.username } });
  fireEvent.change(screen.getByLabelText('App password'), { target: { value: credentials.password } });
}

it('connects with the default folder name when the user leaves it blank', async () => {
  invoke.mockClear();
  invoke.mockResolvedValueOnce({ directory: null, credential_directory: null }).mockResolvedValueOnce(`${parent}foliole/`);
  renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" />);
  const address = screen.getByRole('textbox', { name: 'WebDAV URL' });
  const folder = screen.getByRole('textbox', { name: 'Folder name' });
  const connect = screen.getByRole('button', { name: 'Connect' });
  await waitFor(() => expect(address).toBeEnabled());
  expect(folder).toHaveValue('');
  expect(folder).toHaveAttribute('placeholder', 'foliole');
  fireEvent.change(address, { target: { value: parent } });
  expect(connect).toBeDisabled();
  fillCredentials();
  fireEvent.click(connect);
  await screen.findByText('Connection verified. WebDAV credentials saved securely on this Mac.');
  expect(address).toHaveValue(parent);
  expect(folder).toHaveValue('foliole');
  expect(screen.getByLabelText('App password')).toHaveValue('');
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1', directory_url: parent, new_folder_name: 'foliole', credentials
  });
});

it('retains the URL and custom folder after a failed connection', async () => {
  invoke.mockResolvedValueOnce({ directory: null, credential_directory: null })
    .mockRejectedValueOnce(new Error('webdav_relay_invalid_folder_name')).mockResolvedValueOnce(`${parent}custom/`);
  renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" />);
  const address = screen.getByRole('textbox', { name: 'WebDAV URL' });
  const folder = screen.getByRole('textbox', { name: 'Folder name' });
  const connect = screen.getByRole('button', { name: 'Connect' });
  await waitFor(() => expect(address).toBeEnabled());
  fireEvent.change(address, { target: { value: parent } });
  fireEvent.change(folder, { target: { value: 'bad/name' } });
  fillCredentials();
  fireEvent.click(connect);
  await screen.findByText(/Enter a single folder name/);
  expect(address).toHaveValue(parent);
  expect(folder).toHaveValue('bad/name');
  expect(screen.getByLabelText('App password')).toHaveValue(credentials.password);
  fireEvent.change(folder, { target: { value: 'custom' } });
  fireEvent.click(connect);
  await screen.findByText('Connection verified. WebDAV credentials saved securely on this Mac.');
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1', directory_url: parent, new_folder_name: 'custom', credentials
  });
});

it('keeps a bound folder fixed and updates credentials at the original directory', async () => {
  const directory = `${parent}My%20Library/`;
  invoke.mockResolvedValueOnce({ directory, credential_directory: directory }).mockResolvedValueOnce(directory);
  renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" bound credentialActive />);
  const address = screen.getByRole('textbox', { name: 'WebDAV URL' });
  const folder = screen.getByRole('textbox', { name: 'Folder name' });
  await waitFor(() => expect(address).toHaveValue(parent));
  expect(address).toBeDisabled();
  expect(folder).toHaveValue('My Library');
  expect(folder).toBeDisabled();
  fillCredentials();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByText('Connection verified. WebDAV credentials saved securely on this Mac.');
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1', directory_url: directory, credentials
  });
});

it('restores all four fields on reopening and retries with the saved password', async () => {
  const folder = 'foliole-dev';
  const address = parent;
  let draft: { address: string; folder: string; username: string; password?: string } | null = null;
  draftInvoke.mockImplementation(async (command, args) => {
    if (command === 'save_webdav_setup_draft') {
      draft = { ...draft, ...args.draft };
      return true;
    }
    return draft && { address: draft.address, folder: draft.folder, username: draft.username,
      has_password: Boolean(draft.password) };
  });
  invoke.mockResolvedValueOnce({ directory: null, credential_directory: null })
    .mockRejectedValueOnce(new Error('upload failed'))
    .mockResolvedValueOnce({ directory: null, credential_directory: null })
    .mockResolvedValueOnce(`${address}${folder}/`);
  const settings = renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" />);
  const field = () => screen.getByRole('textbox', { name: 'WebDAV URL' });
  await waitFor(() => expect(field()).toBeEnabled());
  fireEvent.change(field(), { target: { value: address } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Folder name' }), { target: { value: folder } });
  fillCredentials();
  fireEvent.blur(screen.getByLabelText('App password'));
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByText(/could not verify or save/i);
  settings.unmount();

  renderWithLocalization(<SettingsWebDavRelayRow groupId="group-1" />);
  await waitFor(() => expect(field()).toHaveValue(address));
  expect(screen.getByRole('textbox', { name: 'Folder name' })).toHaveValue(folder);
  expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue(credentials.username);
  expect(screen.getByLabelText('App password')).toHaveAttribute('placeholder', 'Password saved');
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByText('Connection verified. WebDAV credentials saved securely on this Mac.');
  expect(invoke).toHaveBeenLastCalledWith('save_webdav_relay_directory', {
    group_id: 'group-1', directory_url: address, new_folder_name: folder, use_setup_password: true,
    credentials: { username: credentials.username, password: '' }
  });
  draftInvoke.mockReset();
});
