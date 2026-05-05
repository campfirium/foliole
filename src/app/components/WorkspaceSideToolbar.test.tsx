import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { AppearanceSettingsProvider } from '../../features/settings/context/AppearanceSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../../features/settings/context/WorkspaceRailSettingsProvider';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

function toolbar(isStudyMode: boolean, onRunRailAction = vi.fn()) {
  return (
    <WorkspaceSideToolbar
      canStartStudyMode
      isImportManagementOpen={false}
      isSettingsOpen={false}
      isStudyMode={isStudyMode}
      reviewDueCount={3}
      onOpenImportManagement={vi.fn()}
      onOpenSettings={vi.fn()}
      onRunRailAction={onRunRailAction}
      onStartClipboardImport={vi.fn()}
      onStartImport={vi.fn()}
      onToggleReviewSession={vi.fn()}
    />
  );
}

function renderToolbar(isStudyMode: boolean) {
  return render(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(isStudyMode)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

it('shows the bottom divider only while review mode is active', () => {
  const { rerender } = renderToolbar(false);

  expect(screen.queryByTestId('workspace-study-divider')).not.toBeInTheDocument();

  rerender(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(true)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  expect(screen.getByTestId('workspace-study-divider')).toBeInTheDocument();
});

it('runs the shared light and dark mode command from the rail theme button', () => {
  const onRunRailAction = vi.fn();
  render(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(false, onRunRailAction)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Toggle Light/Dark Mode' }));

  expect(onRunRailAction).toHaveBeenCalledWith(APP_COMMAND_IDS.toggleBaseColorMode);
});
