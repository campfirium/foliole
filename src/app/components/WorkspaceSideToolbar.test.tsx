import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { AppearanceSettingsProvider } from '../../features/settings/context/AppearanceSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../../features/settings/context/WorkspaceRailSettingsProvider';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

beforeAll(async () => {
  await Promise.all([
    preloadTranslationCatalog('en'),
    preloadTranslationCatalog('zh-Hans')
  ]);
});

function toolbar(isStudyMode: boolean, onRunRailAction = vi.fn(), canStartStudyMode = true) {
  return (
    <WorkspaceSideToolbar
      canStartStudyMode={canStartStudyMode}
      isSettingsOpen={false}
      isStudyMode={isStudyMode}
      reviewDueCount={3}
      onOpenSettings={vi.fn()}
      onRunRailAction={onRunRailAction}
      onStartClipboardImport={vi.fn()}
      onStartImport={vi.fn()}
      onToggleReviewSession={vi.fn()}
    />
  );
}

function renderToolbar(isStudyMode: boolean) {
  return renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(isStudyMode)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
  renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(false, onRunRailAction)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Toggle Light/Dark Mode' }));

  expect(onRunRailAction).toHaveBeenCalledWith(APP_COMMAND_IDS.toggleBaseColorMode);
});

it('runs the feedback command from the bottom rail', () => {
  const onRunRailAction = vi.fn();
  renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(false, onRunRailAction)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Send Feedback' }));

  expect(onRunRailAction).toHaveBeenCalledWith(APP_COMMAND_IDS.sendFeedback);
});

it('keeps the Flow button enabled with an empty review queue prompt', () => {
  const onToggleReviewSession = vi.fn();
  renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>
        <WorkspaceSideToolbar
          canStartStudyMode={false}
          isSettingsOpen={false}
          isStudyMode={false}
          reviewDueCount={0}
          onOpenSettings={vi.fn()}
          onStartClipboardImport={vi.fn()}
          onStartImport={vi.fn()}
          onToggleReviewSession={onToggleReviewSession}
        />
      </WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  const studyButton = screen.getByRole('button', { name: 'Review queue empty' });
  expect(studyButton).not.toBeDisabled();

  fireEvent.click(studyButton);

  expect(onToggleReviewSession).toHaveBeenCalledTimes(1);
});

it('exposes shortcuts on visible rail command buttons', () => {
  window.localStorage.setItem(
    'foliole-workspace-rail-items',
    JSON.stringify([
      {
        commandId: APP_COMMAND_IDS.toggleList,
        id: 'user.toggle-list',
        labelOverride: 'Toggle List',
        order: 0,
        section: 'top',
        source: 'user',
        visible: true
      }
    ])
  );

  renderToolbar(false);

  expect(screen.getByRole('button', { name: 'Toggle List' })).toHaveAttribute('aria-keyshortcuts', '[ Control+Shift+L Meta+Shift+L');
});
