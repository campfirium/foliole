import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import type { NativeReadwiseDeviceAssignment } from '../../../lib/platform/nativeReadwiseDeviceContract';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

const { activate, load } = vi.hoisted(() => ({
  activate: vi.fn(),
  load: vi.fn()
}));

vi.mock('../../shared/platform/import/readwiseDeviceAssignmentRuntimeRepository', () => ({
  activateReadwiseOnThisDeviceInRuntime: activate,
  loadReadwiseDeviceAssignmentFromRuntime: load
}));

function assignment(overrides: Partial<NativeReadwiseDeviceAssignment> = {}): NativeReadwiseDeviceAssignment {
  return {
    active_device_id: 'remote-device',
    active_device_name: 'Office PC',
    current_device_id: 'current-device',
    current_device_name: 'This Mac',
    is_active: false,
    legacy_unassigned: false,
    ...overrides
  };
}

it('disables all Readwise settings on a non-active device and enables them after an explicit switch', async () => {
  load.mockResolvedValue(assignment());
  activate.mockResolvedValue(assignment({
    active_device_id: 'current-device', active_device_name: 'This Mac', is_active: true
  }));
  const settings = createDefaultImportManagerSettings();
  renderWithLocalization(
    <SettingsReadwiseReaderContent
      config={settings.readwiseReaderConfig}
      onSave={vi.fn()}
      readwiseRootPath={settings.readwiseRootPath}
      readwiseSources={settings.readwiseSources}
    />
  );

  await screen.findByText('Readwise Reader runs on Office PC. Switch it here to edit these settings and run imports.');
  const setupFieldset = screen.getByText('Readwise Reader Import').closest('fieldset');
  expect(setupFieldset).toBeDisabled();
  const switchButton = screen.getByRole('button', { name: 'Switch to this device' });
  expect(switchButton).not.toBeDisabled();

  fireEvent.click(switchButton);
  await waitFor(() => expect(setupFieldset).not.toBeDisabled());
  expect(activate).toHaveBeenCalledTimes(1);
});
