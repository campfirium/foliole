import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

function renderToolbar(isStudyMode: boolean) {
  return render(
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

beforeEach(() => {
  vi.restoreAllMocks();
});

it('shows the bottom divider only while review mode is active', () => {
  const { rerender } = renderToolbar(false);

  expect(screen.queryByTestId('workspace-study-divider')).not.toBeInTheDocument();

  rerender(
    <WorkspaceSideToolbar
      canStartStudyMode
      isImportManagementOpen={false}
      isSettingsOpen={false}
      isStudyMode
      reviewDueCount={3}
      onOpenImportManagement={vi.fn()}
      onOpenSettings={vi.fn()}
      onStartClipboardImport={vi.fn()}
      onStartImport={vi.fn()}
      onToggleReviewSession={vi.fn()}
    />
  );

  expect(screen.getByTestId('workspace-study-divider')).toBeInTheDocument();
});
