import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsImportSection } from './SettingsImportSection';
import type { SettingsImportSectionProps } from './settingsImportSectionTypes';

const { openImportRoot } = vi.hoisted(() => ({
  openImportRoot: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../../../shared/platform/runtimeExternalNavigation', () => ({
  openImportRoot
}));

const baseProps: SettingsImportSectionProps = {
  assetsPath: '/library/Assets',
  errorByLocation: {
    assets_dir: null,
    inbox: null,
    library_home: null,
    mirror: null
  },
  inboxPath: '/library/Import/Inbox',
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
  openImportRoot.mockClear();
  window.localStorage.clear();
});

it('shows progress rows while library paths load', async () => {
  renderWithLocalization(<SettingsImportSection {...baseProps} isLoadingLibraryPaths />);

  const statuses = await screen.findAllByRole('status');
  expect(statuses).toHaveLength(2);
  for (const status of statuses) {
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('');
  }
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

it('keeps mirror rows mapped to mirror copy and controls', async () => {
  renderWithLocalization(<SettingsImportSection {...baseProps} />);

  expect(await screen.findByRole('heading', { name: 'Mirror folder' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Change location' })[3]).toHaveTextContent('Mirror');
  expect(screen.queryByText('Use current clipboard when nothing is selected')).not.toBeInTheDocument();
});

it('shows Import above storage and opens the Import folder without making it configurable', async () => {
  renderWithLocalization(<SettingsImportSection {...baseProps} />);

  expect(await screen.findByRole('heading', { name: 'Import' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Storage locations' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Import folder' })).toBeInTheDocument();
  screen.getByRole('button', { name: 'Open Import folder' }).click();
  expect(openImportRoot).toHaveBeenCalledOnce();
  expect(screen.getAllByRole('button', { name: 'Change location' })).toHaveLength(4);
});
