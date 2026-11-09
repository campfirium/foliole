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
  const test = screen.getByRole('button', { name: 'Test and save' });
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
