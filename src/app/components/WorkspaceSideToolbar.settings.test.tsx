import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import { AppearanceSettingsProvider } from '../../features/settings/context/AppearanceSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../../features/settings/context/WorkspaceRailSettingsProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { installDemoRuntimeController } from '../../shared/platform/runtime/demoRuntime';

import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

it('opens settings without forwarding the button click event as a category', () => {
  const demoState = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo: false,
    manualAdvanceDays: 0,
    previewDay: 1,
    startedAt: null
  } as const;
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay: () => undefined,
    getNowIso: (realNow) => realNow.toISOString(),
    getState: () => demoState,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  });
  const onOpenSettings = vi.fn();

  renderWithLocalization(
    <AppearanceSettingsProvider>
      <WorkspaceRailSettingsProvider>
        <WorkspaceSideToolbar
          canStartStudyMode
          isSettingsOpen={false}
          isStudyMode={false}
          onOpenSettings={onOpenSettings}
          onStartClipboardImport={vi.fn()}
          onStartImport={vi.fn()}
          onToggleReviewSession={vi.fn()}
        />
      </WorkspaceRailSettingsProvider>
    </AppearanceSettingsProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  expect(onOpenSettings).toHaveBeenCalledOnce();
  expect(onOpenSettings).toHaveBeenCalledWith();
});

it('opens the native capture panel from the default left toolbar', () => {
  const invoke = vi.fn().mockResolvedValue(null);
  const platform = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
  vi.stubGlobal('electronAPI', { invoke });
  try {
    renderWithLocalization(
      <AppearanceSettingsProvider>
        <WorkspaceRailSettingsProvider>
          <WorkspaceSideToolbar
            canStartStudyMode
            isSettingsOpen={false}
            isStudyMode={false}
            onOpenSettings={vi.fn()}
            onStartClipboardImport={vi.fn()}
            onStartImport={vi.fn()}
            onToggleReviewSession={vi.fn()}
          />
        </WorkspaceRailSettingsProvider>
      </AppearanceSettingsProvider>
    );
    const globalCapture = screen.getByRole('button', { name: 'Global capture' });
    expect(globalCapture.querySelector('svg.lucide-square-scissors')).toBeInTheDocument();

    fireEvent.click(globalCapture);

    expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.openGlobalCapturePanel);
  } finally {
    vi.unstubAllGlobals();
    platform.mockRestore();
  }
});
