import {
  BrowserWindow,
  Menu,
  type BrowserWindow as ElectronBrowserWindow,
  type MenuItem as ElectronMenuItem,
  type MenuItemConstructorOptions
} from 'electron';

import { IPC_MENU_EVENT_CHANNEL, type MenuCommandEvent } from './contracts.js';

const MENU_COMMAND_IDS = [
  'workspace.openNotes',
  'workspace.openTrash',
  'workspace.openSettings',
  'workspace.toggleList',
  'editor.toggleDisplayMode',
  'review.startStudyMode',
  'review.revealAnswer',
  'review.gradeAgain',
  'review.gradeHard',
  'review.gradeGood',
  'review.gradeEasy',
  'navigation.goBack',
  'navigation.goForward',
  'navigation.goParent'
] as const;

const menuItemsById = new Map<string, ElectronMenuItem>();

function commandItem(label: string, commandId: string): MenuItemConstructorOptions {
  return {
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

export function installAppMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Workspace',
      submenu: [
        commandItem('Open Notes', 'workspace.openNotes'),
        commandItem('Open Trash', 'workspace.openTrash'),
        { type: 'separator' },
        commandItem('Toggle Left Panel', 'workspace.toggleList'),
        commandItem('Settings', 'workspace.openSettings')
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        commandItem('Go Back', 'navigation.goBack'),
        commandItem('Go Forward', 'navigation.goForward'),
        commandItem('Go to Parent', 'navigation.goParent')
      ]
    },
    {
      label: 'Review',
      submenu: [
        commandItem('Start Study Mode', 'review.startStudyMode'),
        commandItem('Show Answer', 'review.revealAnswer'),
        { type: 'separator' },
        commandItem('Grade Again (1)', 'review.gradeAgain'),
        commandItem('Grade Hard (2)', 'review.gradeHard'),
        commandItem('Grade Good (3)', 'review.gradeGood'),
        commandItem('Grade Easy (4)', 'review.gradeEasy')
      ]
    },
    {
      label: 'View',
      submenu: [commandItem('Toggle Source / Live Preview', 'editor.toggleDisplayMode')]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  menuItemsById.clear();
  walkMenuItems(menu.items);
}

export function syncAppMenuState(enabledCommandIds: string[]) {
  const enabledSet = new Set(enabledCommandIds);
  for (const commandId of MENU_COMMAND_IDS) {
    const item = menuItemsById.get(commandId);
    if (!item) {
      continue;
    }
    item.enabled = enabledSet.has(commandId);
  }
}

export function bindMenuToWindow(window: ElectronBrowserWindow) {
  window.on('focus', () => {
    window.webContents.send(IPC_MENU_EVENT_CHANNEL, { commandId: '__menu_focus_sync__' });
  });
}
