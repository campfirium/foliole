import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { CompanionColorModeProvider } from './CompanionColorModeProvider';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import { CompanionTopBar } from './CompanionTopBar';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionTopBarProps } from './useCompanionTopBarProps';

function BrowseAppearanceHarness({ directory }: { directory: boolean }) {
  const [activeAction, setActiveAction] = useState('recent');
  const [settingsPage, setSettingsPage] = useState<CompanionSettingsPage>('list');
  const topBar = useCompanionTopBarProps({
    directorySelection: { kind: 'root' }, browseSortDirection: 'desc',
    browseSortKey: 'dateLastOpened', externalDirectory: {} as never,
    isBrowseDirectoryOpen: directory, resetDirectorySelection: vi.fn(),
    setBrowseSortDirection: vi.fn(), setBrowseSortKey: vi.fn(),
    setIsBrowseDirectoryOpen: vi.fn(), setIsCaptureSheetOpen: vi.fn(),
    setSettingsPage, settingsPage,
    surface: { activeAction, handleTabAction: setActiveAction } as never,
    workspaceSync: { state: { remembered_targets: [] }, status: 'idle' } as never
  });
  return <CompanionColorModeProvider>
    <CompanionTopBar {...topBar} visible />
    {activeAction === 'more' ? renderCompanionSettingsContent({
      settingsPage, onBackToSettingsList: () => setSettingsPage('list'),
      onOpenSyncSettings: () => setSettingsPage('sync'),
      onOpenSyncSettingsPage: setSettingsPage, workspaceSync: {} as never
    }) : null}
  </CompanionColorModeProvider>;
}

it.each([false, true])('opens the existing Appearance page from browse/directory (directory=%s)', async (directory) => {
  render(<BrowseAppearanceHarness directory={directory} />);
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByTestId('companion-settings-appearance')).toBeInTheDocument();
});
