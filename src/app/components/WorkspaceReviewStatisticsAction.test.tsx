import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';

import { AppearanceSettingsProvider } from '../../features/settings/context/AppearanceSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../../features/settings/context/WorkspaceRailSettingsProvider';
import { loadWorkspaceRailItems, saveWorkspaceRailItems, toggleWorkspaceRailItemVisibility } from '../../features/settings/model/workspaceRailSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

import { WorkspaceSideToolbar } from './WorkspaceSideToolbar';

beforeAll(() => preloadTranslationCatalog('en'));

it('adds a visible statistics command to an existing rail and preserves the choice after reload', () => {
  window.localStorage.clear();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceRailItems, JSON.stringify([
    { id: 'system.feedback', commandId: APP_COMMAND_IDS.sendFeedback, section: 'bottom', order: 0, visible: false, source: 'system' }
  ]));
  const onRun = vi.fn();
  renderWithLocalization(<AppearanceSettingsProvider><WorkspaceRailSettingsProvider>
    <WorkspaceSideToolbar canStartStudyMode isStudyMode={false} isSettingsOpen={false}
      onOpenSettings={vi.fn()} onRunRailAction={onRun} onStartClipboardImport={vi.fn()}
      onStartImport={vi.fn()} onToggleReviewSession={vi.fn()} />
  </WorkspaceRailSettingsProvider></AppearanceSettingsProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Open review statistics' }));
  expect(onRun).toHaveBeenCalledWith(APP_COMMAND_IDS.openReviewCalendar);
  expect(loadWorkspaceRailItems().find((item) => item.id === 'system.feedback')?.visible).toBe(false);
  saveWorkspaceRailItems(toggleWorkspaceRailItemVisibility(loadWorkspaceRailItems(), 'system.review-statistics', false));
  expect(loadWorkspaceRailItems().find((item) => item.commandId === APP_COMMAND_IDS.openReviewCalendar)?.visible).toBe(false);
});
