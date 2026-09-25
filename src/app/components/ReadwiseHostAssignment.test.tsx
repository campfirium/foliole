import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import type { NativeReadwiseHostAssignment } from '../../../lib/platform/nativeReadwiseHostContract';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

const { activate, activeGroup, load, loadApiConnection } = vi.hoisted(() => ({
  activate: vi.fn(),
  activeGroup: vi.fn(() => true),
  load: vi.fn(),
  loadApiConnection: vi.fn()
}));

vi.mock('../../shared/platform/import/readwiseHostAssignmentRuntimeRepository', () => ({
  activateReadwiseOnThisHostInRuntime: activate,
  loadReadwiseHostAssignmentFromRuntime: load
}));

vi.mock('../../shared/platform/external/useActiveSyncGroup', () => ({
  useActiveSyncGroup: activeGroup
}));
vi.mock('../../shared/platform/import/readwiseApiConnectionRuntimeRepository', () => ({
  loadReadwiseApiConnectionFromRuntime: loadApiConnection,
  connectReadwiseApiFromClipboardInRuntime: vi.fn(),
  disconnectReadwiseApiInRuntime: vi.fn()
}));

beforeEach(() => {
  activate.mockReset();
  activeGroup.mockReturnValue(true);
  load.mockReset();
  loadApiConnection.mockReset();
  loadApiConnection.mockResolvedValue({
    has_credential: false, has_source: true, state: 'disconnected', verified_at: null
  });
});

function assignment(overrides: Partial<NativeReadwiseHostAssignment> = {}): NativeReadwiseHostAssignment {
  return {
    active_host_name: 'Office PC',
    active_device_identity_key: 'office-device',
    active_owner_epoch: 1,
    current_host_name: 'This Mac',
    current_device_identity_key: 'mac-device',
    hosts: [
      { host_name: 'Office PC', platform: 'win32' },
      { host_name: 'This Mac', platform: 'darwin' }
    ],
    is_active: false,
    handoff_pending: false,
    legacy_unassigned: false,
    activation_blocked_reason: 'handoff-required',
    ...overrides
  };
}

it('shows the dynamic import device and one switch action on another desktop', async () => {
  load.mockResolvedValue(assignment());
  const settings = { ...createDefaultImportManagerSettings(), readwiseRootPath: 'D:\\Readwise Reader' };
  renderWithLocalization(
    <SettingsReadwiseReaderContent
      config={settings.readwiseReaderConfig}
      onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath}
      readwiseSources={settings.readwiseSources}
    />
  );

  await screen.findByText('Office PC');
  expect(screen.getByText('Import device')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Readwise root folder' })).not.toBeInTheDocument();
  expect(screen.queryByText('This Mac')).not.toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader Import')).not.toBeInTheDocument();
  expect(screen.queryByText('Both desktops must be available to switch.')).not.toBeInTheDocument();
  const switchButton = screen.getByRole('button', { name: 'Switch to this device' });
  expect(switchButton).not.toBeDisabled();
  expect(activate).not.toHaveBeenCalled();
});

it('shows the ordinary setup before this device has an API connection', async () => {
  load.mockResolvedValue(assignment({
    active_host_name: null, active_device_identity_key: null,
    legacy_unassigned: true, activation_blocked_reason: 'connection-unavailable'
  }));
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent config={settings.readwiseReaderConfig} onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath} readwiseSources={settings.readwiseSources} />
  );
  expect(await screen.findByText('Readwise Reader Import')).toBeInTheDocument();
  expect(screen.queryByText('Import device')).not.toBeInTheDocument();
});

it('offers the existing switch action for a connected legacy library without an import device', async () => {
  load.mockResolvedValue(assignment({
    active_host_name: null, active_device_identity_key: null,
    legacy_unassigned: true, activation_blocked_reason: 'group-quiescence-required'
  }));
  activate.mockResolvedValue(assignment({
    active_host_name: 'This Mac', active_device_identity_key: 'mac-device',
    is_active: true, activation_blocked_reason: null
  }));
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent config={settings.readwiseReaderConfig} onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath} readwiseSources={settings.readwiseSources}
      readwiseSourceMode="api" />
  );
  expect(await screen.findByText('No device selected')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to this device' }));
  await waitFor(() => expect(activate).toHaveBeenCalledOnce());
  expect(await screen.findByRole('button', { name: 'Connect Readwise' })).toBeInTheDocument();
});

it('keeps automatic activation disabled after a local handoff survives library rollback', async () => {
  load.mockResolvedValue(assignment({ active_host_name: null, active_device_identity_key: null,
    legacy_unassigned: true, activation_blocked_reason: 'guard-history' }));
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent config={settings.readwiseReaderConfig} onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath} readwiseSources={settings.readwiseSources} />
  );
  expect(await screen.findByText(/previous handoff is recorded/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Switch to this device' })).toBeDisabled();
});

it('keeps showing the previous import device while the switch is pending', async () => {
  load.mockResolvedValue(assignment({ handoff_pending: true }));
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent config={settings.readwiseReaderConfig} onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath} readwiseSources={settings.readwiseSources} />
  );
  expect(await screen.findByText('Office PC')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Switching…' })).toBeDisabled();
  expect(screen.getByText('The current device keeps importing until the switch completes.'))
    .toBeInTheDocument();
});

it('hides local API controls until the switch completes', async () => {
  load.mockResolvedValue(assignment());
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent config={settings.readwiseReaderConfig} onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath} readwiseSources={settings.readwiseSources}
      readwiseSourceMode="api" />
  );
  expect(await screen.findByRole('button', { name: 'Switch to this device' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Connect Readwise' })).not.toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader Import')).not.toBeInTheDocument();
});

it('opens the ordinary settings after switching to this device', async () => {
  load.mockResolvedValue(assignment());
  activate.mockResolvedValue(assignment({
    active_host_name: 'This Mac', active_device_identity_key: 'mac-device',
    is_active: true, activation_blocked_reason: null
  }));
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent config={settings.readwiseReaderConfig} onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath} readwiseSources={settings.readwiseSources}
      readwiseSourceMode="api" />
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Switch to this device' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Connect Readwise' })).toBeInTheDocument());
  expect(screen.queryByText('Import device')).not.toBeInTheDocument();
});

it('keeps the original settings page when this library is not in an active workgroup', async () => {
  activeGroup.mockReturnValue(false);
  load.mockResolvedValue(assignment());
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent
      config={settings.readwiseReaderConfig}
      onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath}
      readwiseSources={settings.readwiseSources}
    />
  );

  expect(await screen.findByText('Readwise Reader Import')).toBeInTheDocument();
  expect(screen.queryByText('Import device')).not.toBeInTheDocument();
});
