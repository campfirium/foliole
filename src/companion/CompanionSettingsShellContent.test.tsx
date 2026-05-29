import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

function SettingsHarness() {
  const [settingsPage, setSettingsPage] = useState<CompanionSettingsPage>('list');
  return renderCompanionSettingsContent({
    onBackToSettingsList: () => setSettingsPage('list'),
    onOpenSyncSettings: () => setSettingsPage('sync'),
    onOpenSyncSettingsPage: setSettingsPage,
    settingsPage,
    workspaceSync: { state: { sync_onboarding_status: 'pending' } } as never
  });
}

describe('CompanionSettingsShellContent', () => {
  it('opens placeholder settings detail rows instead of leaving dead controls', () => {
    render(<SettingsHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Device information/ }));
    expect(screen.getByText('Device information')).toBeInTheDocument();
    expect(screen.getByText('Device information will appear here.')).toBeInTheDocument();
  });

  it('opens the appearance placeholder page', () => {
    render(<SettingsHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Display preferences/ }));
    expect(screen.getByText('Display preferences')).toBeInTheDocument();
  });

  it('opens the debug placeholder page', () => {
    render(<SettingsHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Diagnostics/ }));
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
  });
});
