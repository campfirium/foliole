import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import type { NativeReadwiseHostAssignment } from '../../../lib/platform/nativeReadwiseHostContract';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

const { activate, activeGroup, load } = vi.hoisted(() => ({
  activate: vi.fn(),
  activeGroup: vi.fn(() => true),
  load: vi.fn()
}));

vi.mock('../../shared/platform/import/readwiseHostAssignmentRuntimeRepository', () => ({
  activateReadwiseOnThisHostInRuntime: activate,
  loadReadwiseHostAssignmentFromRuntime: load
}));

vi.mock('../../shared/platform/external/useActiveSyncGroup', () => ({
  useActiveSyncGroup: activeGroup
}));

beforeEach(() => {
  activate.mockReset();
  activeGroup.mockReturnValue(true);
  load.mockReset();
});

function assignment(overrides: Partial<NativeReadwiseHostAssignment> = {}): NativeReadwiseHostAssignment {
  return {
    active_host_name: 'Office PC',
    current_host_name: 'This Mac',
    hosts: [
      { host_name: 'Office PC', platform: 'win32' },
      { host_name: 'This Mac', platform: 'darwin' }
    ],
    is_active: false,
    legacy_unassigned: false,
    ...overrides
  };
}

it('keeps local Readwise settings private while another Host is active and restores them after switching', async () => {
  load.mockResolvedValue(assignment());
  activate.mockResolvedValue(assignment({
    active_host_name: 'This Mac', is_active: true
  }));
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
  expect(screen.getByText('Windows')).toBeInTheDocument();
  expect(screen.getByText('Current active host')).toBeInTheDocument();
  expect(screen.queryByText('D:\\Readwise Reader')).not.toBeInTheDocument();
  expect(screen.queryByText('This Mac')).not.toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader Import')).not.toBeInTheDocument();
  const switchButton = screen.getByRole('button', { name: 'Switch to this host' });
  expect(switchButton).not.toBeDisabled();

  fireEvent.click(switchButton);
  await waitFor(() => expect(screen.getByText('Readwise Reader Import')).toBeInTheDocument());
  expect(screen.queryByText('Current active host')).not.toBeInTheDocument();
  expect(screen.queryByText('Office PC')).not.toBeInTheDocument();
  expect(activate).toHaveBeenCalledTimes(1);
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
