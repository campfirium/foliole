import { afterEach, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';

import {
  getWorkspaceRailSectionItems,
  loadWorkspaceRailItems,
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
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it('adds Open File beside Import and remembers when it is hidden', () => {
  saveWorkspaceRailItems([importItem]);
  vi.stubGlobal('electronAPI', { invoke: vi.fn() });

  const items = loadWorkspaceRailItems();
  const visibleCommands = getWorkspaceRailSectionItems(items, 'top')
    .filter((item) => item.visible)
    .map((item) => item.commandId);
  const importIndex = visibleCommands.indexOf(APP_COMMAND_IDS.importSingleFile);
  expect(importIndex).toBeGreaterThan(0);
  expect(visibleCommands[importIndex - 1]).toBe(APP_COMMAND_IDS.openLocalFile);

  const openItem = items.find((item) => item.commandId === APP_COMMAND_IDS.openLocalFile)!;
  saveWorkspaceRailItems(toggleWorkspaceRailItemVisibility(items, openItem.id, false));
  expect(loadWorkspaceRailItems().find((item) => item.id === openItem.id)?.visible).toBe(false);
});

it('preserves a previously customized Open File action', () => {
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
