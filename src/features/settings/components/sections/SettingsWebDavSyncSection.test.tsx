import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { registerAppConfirmationHandler } from '../../../../shared/ui/appConfirmation';

import { SettingsWebDavSyncSection } from './SettingsWebDavSyncSection';

const { useDesktopSyncGroup, invoke } = vi.hoisted(() => ({
  useDesktopSyncGroup: vi.fn(),
  invoke: vi.fn()
}));
vi.mock('../../../../shared/platform/useDesktopSyncGroup', () => ({ useDesktopSyncGroup }));
vi.mock('../../../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => (command: string, ...args: unknown[]) =>
  command.endsWith('_webdav_setup_draft') ? Promise.resolve(null) : invoke(command, ...args) }));

const group = {
  group_id: 'group-1', local_device_identity_key: 'mac',
  devices: [
    { device_identity_key: 'phone', device_name: 'A5', platform: 'android', state: 'active' },
    { device_identity_key: 'desktop', device_name: 'Desktop', platform: 'windows', state: 'active' }
  ]
};

function setRelay(configured: boolean, deviceId: string | null = null, delivered = false, available = ['phone'], baselineRequired = false) {
  useDesktopSyncGroup.mockReturnValue({ isLoading: false, overview: {
    sync_group: group, webdav_relay: { configured, device_id: deviceId, delivered, available_device_ids: available, lan_baseline_required: baselineRequired }
  } });
}

afterEach(() => vi.resetAllMocks());

it('shows device setup but keeps it disabled until WebDAV is configured', async () => {
  setRelay(false);
  invoke.mockResolvedValue(null);
  const view = renderWithLocalization(<SettingsWebDavSyncSection />);

  expect(screen.getByText('Service not configured')).toBeVisible();
  expect(screen.getByRole('radio', { name: 'Limit size' })).toBeEnabled();
  expect(screen.getByRole('heading', { name: 'Connect another device' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Choose device' })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'WebDAV URL' })).toBeEnabled());
  setRelay(true);
  view.rerender(<SettingsWebDavSyncSection />);
  expect(screen.getByRole('button', { name: 'Choose device' })).toBeEnabled();
});

it('opens the host log even before configuration and lets the user retry an open failure', async () => {
  setRelay(false);
  invoke.mockImplementation((command: string) => command === 'open_webdav_relay_log'
    ? Promise.reject(new Error('system open failed')) : Promise.resolve(null));
  renderWithLocalization(<SettingsWebDavSyncSection />);
  const button = screen.getByRole('button', { name: 'Open log file' });
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not open the WebDAV log file.');
  expect(invoke).toHaveBeenCalledWith('open_webdav_relay_log');

  invoke.mockResolvedValueOnce('empty').mockResolvedValue(null);
  fireEvent.click(button);
  expect(await screen.findByText('No WebDAV logs yet.')).toBeVisible();
  fireEvent.click(button);
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('requires confirmation and reports host rejection before rendering a delivered binding', async () => {
  setRelay(true);
  invoke.mockResolvedValueOnce({ directory: 'https://dav.example.net/relay/', credential_directory: null }).mockRejectedValueOnce(new Error('unreachable'));
  const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const unregister = registerAppConfirmationHandler(confirm);
  try {
    const { rerender } = renderWithLocalization(<SettingsWebDavSyncSection />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'WebDAV URL' })).toHaveValue('https://dav.example.net/'));
    expect(screen.getByRole('textbox', { name: 'Folder name' })).toHaveValue('relay');
    expect(screen.getByRole('textbox', { name: 'Username' })).toBeVisible();
    expect(screen.getByLabelText('App password')).toBeVisible();
    const choose = screen.getByRole('button', { name: 'Choose device' });
    fireEvent.keyDown(choose, { key: 'ArrowDown' });
    expect(screen.queryByRole('menuitem', { name: 'Desktop' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'A5' }));
    await waitFor(() => expect(choose).toBeEnabled());
    expect(invoke).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(choose, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'A5' }));
    await screen.findByRole('alert');
    expect(invoke).toHaveBeenLastCalledWith('enable_webdav_relay', { group_id: 'group-1', device_id: 'phone' });

    setRelay(true, 'phone');
    rerender(<SettingsWebDavSyncSection />);
    expect(screen.getByText('A5 · Waiting for device')).toBeVisible();
    setRelay(true, 'phone', true);
    rerender(<SettingsWebDavSyncSection />);
    expect(screen.getByText('A5 · WebDAV enabled')).toBeVisible();
  } finally {
    unregister();
  }
});

it('keeps the phone visible and updates whether it can be selected when LAN availability changes', async () => {
  setRelay(true, null, false, []);
  invoke.mockResolvedValue({ directory: 'https://dav.example.net/relay/', credential_directory: null });
  const { rerender } = renderWithLocalization(<SettingsWebDavSyncSection />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'WebDAV URL' })).toHaveValue('https://dav.example.net/'));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Choose device' }), { key: 'ArrowDown' });
  expect(await screen.findByRole('menuitem', { name: 'A5' })).toHaveAttribute('aria-disabled', 'true');
  setRelay(true);
  rerender(<SettingsWebDavSyncSection />);
  expect(screen.getByRole('menuitem', { name: 'A5' })).not.toHaveAttribute('aria-disabled', 'true');
});

it('clears the LAN sync instruction when the delivered binding is ready again', async () => {
  setRelay(true, 'phone', true, [], true);
  invoke.mockResolvedValue({ directory: 'https://dav.example.net/relay/', credential_directory: null });
  const { rerender } = renderWithLocalization(<SettingsWebDavSyncSection />);
  const instruction = 'A5 · Connect both devices to the same local network and sync once to use WebDAV';
  expect(await screen.findByText(instruction)).toBeVisible();
  setRelay(true, 'phone', true, []);
  rerender(<SettingsWebDavSyncSection />);
  expect(screen.queryByText(instruction)).not.toBeInTheDocument();
  expect(screen.getByText('A5 · WebDAV enabled')).toBeVisible();
});

it('reports an upload with device receipt still unconfirmed', async () => {
  useDesktopSyncGroup.mockReturnValue({ isLoading: false, overview: {
    sync_group: group, webdav_relay: { configured: true, device_id: 'phone', delivered: true, published_via_relay: true }
  } });
  invoke.mockResolvedValue({ directory: 'https://dav.example.net/relay/', credential_directory: null });
  renderWithLocalization(<SettingsWebDavSyncSection />);
  expect(await screen.findByText('A5 · Updates uploaded to WebDAV. Device receipt unconfirmed.')).toBeVisible();
});
