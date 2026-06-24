import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { AppearanceSettingsProvider } from '../../features/settings/context/AppearanceSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../../features/settings/context/WorkspaceRailSettingsProvider';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';
import { installDemoRuntimeController, type DemoRuntimeController, type DemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';

import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

vi.mock('../../shared/platform/runtimeExternalNavigation', () => ({
  openExternalUrl: vi.fn()
}));

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

function installDemoState(isDemo: boolean) {
  const state: DemoRuntimeState = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo,
    manualAdvanceDays: 0,
    previewDay: 1,
    startedAt: null
  };
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay: () => undefined,
    getNowIso: (realNow) => realNow.toISOString(),
    getState: () => state,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  } satisfies DemoRuntimeController);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  installDemoState(false);
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

it('runs immersive reading from the top rail', () => {
  const onRunRailAction = vi.fn();
  renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(false, onRunRailAction)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: /Immersive Reading/ }));

  expect(onRunRailAction).toHaveBeenCalledWith(APP_COMMAND_IDS.toggleImmersiveMode);
});

it('runs search and command palette from the top rail', () => {
  const onRunRailAction = vi.fn();
  renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(false, onRunRailAction)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByRole('button', { name: 'Command Palette' }));

  expect(onRunRailAction).toHaveBeenCalledWith(APP_COMMAND_IDS.openWorkspaceSearch);
  expect(onRunRailAction).toHaveBeenCalledWith(APP_COMMAND_IDS.openCommandPalette);
});

it('suppresses accent focus rings on rail buttons', () => {
  renderToolbar(false);

  for (const button of screen.getAllByRole('button')) {
    expect(button.className).toContain('app-focus-silent');
    expect(button.className).toContain('focus-visible:bg-foreground/[0.06]');
    expect(button.className).toContain('focus:outline-none');
    expect(button.className).toContain('focus-visible:ring-0');
    expect(button.className).toContain('focus-visible:[--tw-ring-shadow:0_0_#0000]');
    expect(button.className).not.toContain('focus-visible:ring-border-strong');
    expect(button.className).not.toContain('focus-visible:ring-ring');
  }
});

it('shows localized search and command palette rail actions', () => {
  window.localStorage.setItem('foliole-app-language', 'zh-Hans');

  renderToolbar(false);

  expect(screen.getByRole('button', { name: '搜索' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '命令面板' })).toBeInTheDocument();
});

it('shows Demo conversion actions in the bottom rail', () => {
  installDemoState(true);
  const onRunRailAction = vi.fn();

  renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(false, onRunRailAction)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(openExternalUrl).toHaveBeenCalledWith('https://foliole.app/');

  fireEvent.click(screen.getByRole('button', { name: 'Download app' }));
  expect(openExternalUrl).toHaveBeenCalledWith('https://github.com/campfirium/foliole/releases');

  fireEvent.click(screen.getByRole('button', { name: 'Send Feedback' }));
  expect(onRunRailAction).toHaveBeenCalledWith(APP_COMMAND_IDS.sendFeedback);

  expect(screen.getByRole('button', { name: 'Reset data' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
});

it('shows localized Demo conversion actions in the bottom rail', () => {
  window.localStorage.setItem('foliole-app-language', 'zh-Hans');
  installDemoState(true);

  renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>{toolbar(false)}</WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  expect(screen.getByRole('button', { name: '主页' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '下载应用' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重置数据' })).toBeInTheDocument();
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
