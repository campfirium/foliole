import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsImportSection } from './SettingsImportSection';
import type { SettingsImportSectionProps } from './settingsImportSectionTypes';

const baseProps: SettingsImportSectionProps = {
  assetsPath: '/library/Assets',
  errorByLocation: {
    assets_dir: null,
    inbox: null,
    library_home: null,
    mirror: null
  },
  inboxPath: '/library/Inbox',
  isDesktopRuntime: true,
  isLoadingLibraryPaths: false,
  isRebuildingMirrorLinks: false,
  isRebuildingMirrorOutput: false,
  libraryHomePath: '/library',
  mirrorLinkRebuildError: null,
  mirrorLinkRebuildFeedback: null,
  mirrorOutputRebuildError: null,
  mirrorOutputRebuildFeedback: null,
  mirrorPath: '/library/Mirror',
  onChangeLocation: vi.fn(),
  onRebuildMirrorLinks: vi.fn(),
  onRebuildMirrorOutput: vi.fn(),
  onRestoreDefault: vi.fn(),
  pendingLocation: null
};

beforeEach(() => {
  window.localStorage.clear();
});

it('shows progress rows while library paths load', async () => {
  renderWithLocalization(<SettingsImportSection {...baseProps} isLoadingLibraryPaths />);

  const status = await screen.findByRole('status');
  expect(status).toHaveAttribute('aria-busy', 'true');
  expect(status).toHaveTextContent('');
});

it('marks library path and mirror rebuild errors as alerts', async () => {
  renderWithLocalization(
    <SettingsImportSection
      {...baseProps}
      errorByLocation={{ ...baseProps.errorByLocation, inbox: 'Could not choose a new Inbox folder.' }}
      mirrorOutputRebuildError="Could not rebuild mirror output."
    />
  );

  expect((await screen.findAllByRole('alert')).map((element) => element.textContent)).toEqual([
    'Could not choose a new Inbox folder.',
    'Could not rebuild mirror output.'
  ]);
});

it('uses separate action labels for mirror rebuild and link repair', async () => {
  renderWithLocalization(<SettingsImportSection {...baseProps} />);

  expect(await screen.findByRole('button', { name: 'Rebuild mirror' })).toHaveTextContent('Rebuild');
  expect(screen.getByRole('button', { name: 'Repair mirror links' })).toHaveTextContent('Repair');
});

it('enables current clipboard fallback by default and lets users turn it off', async () => {
  renderWithLocalization(<SettingsImportSection {...baseProps} />);

  const toggle = await screen.findByRole('switch', { name: 'Use current clipboard when nothing is selected' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.globalClipExistingClipboardFallbackEnabled)).toBe('false');

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.globalClipExistingClipboardFallbackEnabled)).toBe('true');
});
