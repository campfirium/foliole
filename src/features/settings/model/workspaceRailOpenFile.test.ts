import { afterEach, expect, it, vi } from 'vitest';

import { DESKTOP_GLOBAL_CAPTURE_ACTION } from '../../../shared/commands/desktopGlobalCaptureAction';
import { APP_COMMAND_IDS } from '../../../shared/commands/ids';

import {
  getWorkspaceRailSectionItems,
  loadWorkspaceRailItems,
  resetWorkspaceRailItems,
  saveWorkspaceRailItems,
  toggleWorkspaceRailItemVisibility,
  type WorkspaceRailItemConfig
} from './workspaceRailSettings';

const importItem: WorkspaceRailItemConfig = {
  id: 'system.import-file',
  commandId: APP_COMMAND_IDS.importSingleFile,
  section: 'top',
  order: 0,
  visible: true,
  source: 'system'
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it('prioritizes import and places external documents below global capture by default', () => {
  vi.stubGlobal('electronAPI', { invoke: vi.fn() });
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');

  for (const items of [loadWorkspaceRailItems(), resetWorkspaceRailItems()]) {
    const visibleCommands = getWorkspaceRailSectionItems(items, 'top')
      .filter((item) => item.visible)
      .map((item) => item.commandId);
    expect(visibleCommands.slice(0, 5)).toEqual([
      APP_COMMAND_IDS.importSingleFile,
      APP_COMMAND_IDS.clipboardImport,
      APP_COMMAND_IDS.toggleImmersiveMode,
      DESKTOP_GLOBAL_CAPTURE_ACTION.id,
      APP_COMMAND_IDS.openLocalFile
    ]);
  }
});

it('adds the external document action and remembers when it is hidden', () => {
  saveWorkspaceRailItems([importItem]);
  vi.stubGlobal('electronAPI', { invoke: vi.fn() });

  const items = loadWorkspaceRailItems();
  const openItem = items.find((item) => item.commandId === APP_COMMAND_IDS.openLocalFile)!;
  expect(openItem.iconId).toBe('FileSymlink');
  saveWorkspaceRailItems(toggleWorkspaceRailItemVisibility(items, openItem.id, false));
  expect(loadWorkspaceRailItems().find((item) => item.id === openItem.id)?.visible).toBe(false);
});

it('preserves a previously customized external document action', () => {
  vi.stubGlobal('electronAPI', { invoke: vi.fn() });
  const customized: WorkspaceRailItemConfig = {
    id: 'user.localFile-open',
    commandId: APP_COMMAND_IDS.openLocalFile,
    section: 'bottom',
    order: 0,
    visible: false,
    source: 'user',
    iconId: 'FileText'
  };
  saveWorkspaceRailItems([importItem, customized]);

  const actions = loadWorkspaceRailItems().filter((item) => item.commandId === APP_COMMAND_IDS.openLocalFile);
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({
    id: customized.id,
    section: customized.section,
    visible: customized.visible,
    iconId: customized.iconId
  });
});

it('omits the desktop file picker from the browser toolbar', () => {
  const items = loadWorkspaceRailItems();
  expect(getWorkspaceRailSectionItems(items, 'top').some((item) => item.commandId === APP_COMMAND_IDS.openLocalFile))
    .toBe(false);
});
