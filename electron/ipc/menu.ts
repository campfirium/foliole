import {
  BrowserWindow,
  Menu,
  type BrowserWindow as ElectronBrowserWindow,
  type MenuItem as ElectronMenuItem,
  type MenuItemConstructorOptions
} from 'electron';

import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../lib/core/nodes/folderTopicItemCommands.js';

import { IPC_MENU_EVENT_CHANNEL, type MenuCommandEvent } from './contracts.js';

const menuItemsById = new Map<string, ElectronMenuItem>();

export interface NativeMenuShortcutAccelerator {
  accelerator: string;
  commandId: string;
}

interface MenuState {
  acceleratorsById: ReadonlyMap<string, string>;
  enabledSet: ReadonlySet<string> | null;
}

const defaultMenuState: MenuState = {
  acceleratorsById: new Map(),
  enabledSet: null
};

function commandItem(label: string, commandId: string, state: MenuState): MenuItemConstructorOptions {
  const accelerator = state.acceleratorsById.get(commandId);
  return {
    ...(accelerator ? { accelerator } : {}),
    enabled: state.enabledSet ? state.enabledSet.has(commandId) : true,
    id: commandId,
    label,
    click: () => {
      const window = BrowserWindow.getFocusedWindow();
      if (!window) {
        return;
      }
      const payload: MenuCommandEvent = { commandId };
      window.webContents.send(IPC_MENU_EVENT_CHANNEL, payload);
    }
  };
}

function walkMenuItems(items: ElectronMenuItem[]) {
  for (const item of items) {
    if (item.id) {
      menuItemsById.set(item.id, item);
    }
    if (item.submenu) {
      walkMenuItems(item.submenu.items);
    }
  }
}

function buildAppMenuTemplate(state: MenuState): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Workspace',
      submenu: [
        ...FOLDER_TOPIC_ITEM_COMMANDS.map((command) => commandItem(command.menuLabel, command.appCommandId, state)),
        { type: 'separator' },
        commandItem('Import Files…', 'import.singleFileToInbox', state),
        commandItem('Import Folder…', 'import.folderToInbox', state),
        commandItem('Import Clipboard', 'import.clipboard', state),
        { type: 'separator' },
        commandItem('Open Notes', 'workspace.openNotes', state),
        commandItem('Open Trash', 'workspace.openTrash', state),
        { type: 'separator' },
        commandItem('Toggle Left Panel', 'workspace.toggleList', state),
        commandItem('Settings', 'workspace.openSettings', state)
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        commandItem('Go Back', 'navigation.goBack', state),
        commandItem('Go Forward', 'navigation.goForward', state),
        commandItem('Go to…', 'navigation.goToNode', state),
        commandItem('Go to Parent', 'navigation.goParent', state)
      ]
    },
    {
      label: 'Review',
      submenu: [
        commandItem('Start Study Mode', 'review.startStudyMode', state),
        commandItem('Show Answer', 'review.revealAnswer', state),
        { type: 'separator' },
        commandItem('Grade Again (1)', 'review.gradeAgain', state),
        commandItem('Grade Hard (2)', 'review.gradeHard', state),
        commandItem('Grade Good (3)', 'review.gradeGood', state),
        commandItem('Grade Easy (4)', 'review.gradeEasy', state)
      ]
    },
    {
      label: 'Editor',
      submenu: [
        commandItem('Undo', 'app.undo', state),
        commandItem('Redo', 'app.redo', state),
        { type: 'separator' },
        commandItem('Find in Topic', 'document.findInTopic', state),
        commandItem('Set Priority…', 'nodes.enterPriorityMode', state),
        { type: 'separator' },
        commandItem('Toggle Source / Live Preview', 'editor.toggleDisplayMode', state),
        commandItem('Toggle Immersive Reading', 'editor.toggleImmersiveMode', state)
      ]
    },
    {
      label: 'Developer',
      submenu: [commandItem('Toggle DevTools', 'workspace.toggleDevTools', state)]
    }
  ];
}

function setAppMenu(template: MenuItemConstructorOptions[]) {
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  menuItemsById.clear();
  walkMenuItems(menu.items);
}

export function installAppMenu() {
  setAppMenu(buildAppMenuTemplate(defaultMenuState));
}

export function syncAppMenuState(enabledCommandIds: string[], shortcutAccelerators: NativeMenuShortcutAccelerator[] = []) {
  const enabledSet = new Set(enabledCommandIds);
  const acceleratorsById = new Map(shortcutAccelerators.map((item) => [item.commandId, item.accelerator]));
  setAppMenu(buildAppMenuTemplate({ acceleratorsById, enabledSet }));
}

export function bindMenuToWindow(window: ElectronBrowserWindow) {
  window.on('focus', () => {
    window.webContents.send(IPC_MENU_EVENT_CHANNEL, { commandId: '__menu_focus_sync__' });
  });
}
