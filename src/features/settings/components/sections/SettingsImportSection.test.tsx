import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

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

it('shows loading rows while library paths load', () => {
  render(<SettingsImportSection {...baseProps} isLoadingLibraryPaths />);

  const status = screen.getByRole('status');
  expect(status).toHaveAttribute('aria-busy', 'true');
  expect(status).toHaveTextContent('Loading library locations');
  expect(status).toHaveTextContent('Loading library folders, attachment folders, and incoming file folder.');
});

it('marks library path and mirror rebuild errors as alerts', () => {
  render(
    <SettingsImportSection
      {...baseProps}
      errorByLocation={{ ...baseProps.errorByLocation, inbox: 'Could not choose a new Inbox folder.' }}
      mirrorOutputRebuildError="Could not rebuild mirror output."
    />
  );

  expect(screen.getAllByRole('alert').map((element) => element.textContent)).toEqual([
    'Could not choose a new Inbox folder.',
    'Could not rebuild mirror output.'
  ]);
});
