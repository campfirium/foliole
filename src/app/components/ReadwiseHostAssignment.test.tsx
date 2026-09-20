import { screen } from '@testing-library/react';
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
    legacy_unassigned: false,
    activation_blocked_reason: 'handoff-required',
    ...overrides
  };
}

it('offers local folder preparation but not import execution before handoff', async () => {
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
  expect(screen.getByText('Current active host')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise root folder' })).toHaveTextContent('Reader');
  expect(screen.queryByText('This Mac')).not.toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader Import')).not.toBeInTheDocument();
  expect(screen.getByText('Both desktops must be available to switch.')).toBeInTheDocument();
  const switchButton = screen.getByRole('button', { name: 'Switch to this host' });
  expect(switchButton).not.toBeDisabled();
  expect(activate).not.toHaveBeenCalled();
});

it('shows the paused state when a synced library has no selected desktop', async () => {
  load.mockResolvedValue(assignment({
    active_host_name: null, active_device_identity_key: null,
    legacy_unassigned: true, activation_blocked_reason: 'group-quiescence-required'
  }));
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent config={settings.readwiseReaderConfig} onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath} readwiseSources={settings.readwiseSources} />
  );
  expect(await screen.findByText('No device selected')).toBeInTheDocument();
  expect(screen.getByText('Readwise is paused. Both desktops must be available to choose a device.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Use this device' })).not.toBeDisabled();
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
  expect(screen.getByRole('button', { name: 'Use this device' })).toBeDisabled();
});

it('shows local API connection setup without exposing import execution to a non-owner', async () => {
  load.mockResolvedValue(assignment());
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent config={settings.readwiseReaderConfig} onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath} readwiseSources={settings.readwiseSources}
      readwiseSourceMode="api" />
  );
  expect(await screen.findByRole('button', { name: 'Connect Readwise' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Switch to this host' })).not.toBeDisabled();
  expect(screen.queryByText('Readwise Reader Import')).not.toBeInTheDocument();
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
  expect(screen.queryByText('Current active host')).not.toBeInTheDocument();
});
