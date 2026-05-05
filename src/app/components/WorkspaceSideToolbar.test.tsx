import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { WorkspaceRailSettingsProvider } from '../../features/settings/context/WorkspaceRailSettingsProvider';

import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

function toolbar(isStudyMode: boolean) {
  return (
    <WorkspaceSideToolbar
      canStartStudyMode
      isImportManagementOpen={false}
      isSettingsOpen={false}
      isStudyMode={isStudyMode}
      reviewDueCount={3}
      onOpenImportManagement={vi.fn()}
      onOpenSettings={vi.fn()}
      onStartClipboardImport={vi.fn()}
      onStartImport={vi.fn()}
      onToggleReviewSession={vi.fn()}
    />
  );
}

function renderToolbar(isStudyMode: boolean) {
  return render(<WorkspaceRailSettingsProvider>{toolbar(isStudyMode)}</WorkspaceRailSettingsProvider>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

it('shows the bottom divider only while review mode is active', () => {
  const { rerender } = renderToolbar(false);

  expect(screen.queryByTestId('workspace-study-divider')).not.toBeInTheDocument();

  rerender(
    <WorkspaceRailSettingsProvider>{toolbar(true)}</WorkspaceRailSettingsProvider>
  );

  expect(screen.getByTestId('workspace-study-divider')).toBeInTheDocument();
});
