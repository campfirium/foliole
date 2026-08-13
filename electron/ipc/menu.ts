import {
  app,
  Menu,
  type BrowserWindow as ElectronBrowserWindow,
  type MenuItem as ElectronMenuItem,
  type MenuItemConstructorOptions
} from 'electron';

import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../lib/core/nodes/folderTopicItemCommands.js';

import { IPC_MENU_EVENT_CHANNEL, type MenuCommandEvent } from './contracts.js';
import { resolveMenuCommandWindow } from './menuCommandWindow.js';

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

function shouldAlwaysDispatchCommand(commandId: string) {
  return commandId === 'app.undo' || commandId === 'app.redo';
}

function commandItem(label: string, commandId: string, state: MenuState): MenuItemConstructorOptions {
  const accelerator = state.acceleratorsById.get(commandId);
  return {
    ...(accelerator ? { accelerator } : {}),
    enabled: state.enabledSet ? shouldAlwaysDispatchCommand(commandId) || state.enabledSet.has(commandId) : true,
    id: commandId,
    label,
    click: (_menuItem, candidate) => {
      const window = resolveMenuCommandWindow(candidate);
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

function buildWorkspaceMenu(state: MenuState): MenuItemConstructorOptions {
  return {
    label: 'Workspace',
    submenu: [
      ...FOLDER_TOPIC_ITEM_COMMANDS.map((command) => commandItem(command.menuLabel, command.appCommandId, state)),
      { type: 'separator' },
      commandItem('Open File…', 'localFile.open', state),
      commandItem('Import Files…', 'import.singleFileToInbox', state),
      commandItem('Import Folder…', 'import.folderToInbox', state),
      commandItem('Import Clipboard', 'import.clipboard', state),
      { type: 'separator' },
      commandItem('Open Notes', 'workspace.openNotes', state),
      commandItem('Open Guided Sample', 'workspace.openGuidedSample', state),
      commandItem('Open Trash', 'workspace.openTrash', state),
      { type: 'separator' },
      commandItem('Toggle Left Panel', 'workspace.toggleList', state),
      commandItem('Settings', 'workspace.openSettings', state)
    ]
  };
}

function buildHelpMenu(state: MenuState): MenuItemConstructorOptions {
  return {
    label: 'Help',
    submenu: [
      commandItem('Check for Updates', 'release.checkForUpdates', state),
      commandItem('Open Releases', 'release.openLatestRelease', state),
      { type: 'separator' },
      commandItem('GitHub Repository', 'support.openRepository', state),
      commandItem('Send Feedback', 'support.sendFeedback', state),
      commandItem('Email', 'support.email', state),
      commandItem('Report an Issue', 'support.openIssues', state),
      commandItem('Discussions', 'support.openDiscussions', state)
    ]
  };
}

function buildViewMenu(state: MenuState): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      commandItem('Increase Panel Content Size', 'view.increaseContentRegionScale', state),
      commandItem('Decrease Panel Content Size', 'view.decreaseContentRegionScale', state),
      commandItem('Reset Panel Content Size', 'view.resetContentRegionScale', state)
    ]
  };
}

function buildMacosEditMenu(state: MenuState): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      commandItem('Undo', 'app.undo', state),
      commandItem('Redo', 'app.redo', state),
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
      { type: 'separator' },
      { role: 'startSpeaking' },
      { role: 'stopSpeaking' }
    ]
  };
}

function buildMacosStandardMenus(state: MenuState, platform: NodeJS.Platform): MenuItemConstructorOptions[] {
  if (platform !== 'darwin') return [];
  return [
    { role: 'appMenu' },
    buildMacosEditMenu(state),
    { role: 'windowMenu' }
  ];
}

function buildEditorMenu(state: MenuState, platform: NodeJS.Platform): MenuItemConstructorOptions {
  const historyItems: MenuItemConstructorOptions[] = platform === 'darwin'
    ? []
    : [
        commandItem('Undo', 'app.undo', state),
        commandItem('Redo', 'app.redo', state),
        { type: 'separator' }
      ];
  return {
    label: 'Editor',
    submenu: [
      ...historyItems,
      commandItem('Find in Topic', 'document.findInTopic', state),
      commandItem('Set Priority…', 'nodes.enterPriorityMode', state),
      { type: 'separator' },
      commandItem('Toggle Source / Live Preview', 'editor.toggleDisplayMode', state),
      commandItem('Toggle Immersive Reading', 'editor.toggleImmersiveMode', state)
    ]
  };
}

function buildAppMenuTemplate(
  state: MenuState,
  platform: NodeJS.Platform = process.platform
): MenuItemConstructorOptions[] {
  const developerMenu = app.isPackaged
    ? []
    : [
        {
          label: 'Developer',
          submenu: [commandItem('Toggle DevTools', 'workspace.toggleDevTools', state)]
        }
      ];
  return [
    ...buildMacosStandardMenus(state, platform),
    buildViewMenu(state),
    buildWorkspaceMenu(state),
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
    buildEditorMenu(state, platform),
    ...developerMenu,
    buildHelpMenu(state)
  ];
}

function setAppMenu(template: MenuItemConstructorOptions[]) {
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  menuItemsById.clear();
  walkMenuItems(menu.items);
}

export function installAppMenu(platform: NodeJS.Platform = process.platform) {
  setAppMenu(buildAppMenuTemplate(defaultMenuState, platform));
}

export function syncAppMenuState(
  enabledCommandIds: string[],
  shortcutAccelerators: NativeMenuShortcutAccelerator[] = [],
  platform: NodeJS.Platform = process.platform
) {
  const enabledSet = new Set(enabledCommandIds);
  const acceleratorsById = new Map(shortcutAccelerators.map((item) => [item.commandId, item.accelerator]));
  setAppMenu(buildAppMenuTemplate({ acceleratorsById, enabledSet }, platform));
}

export function bindMenuToWindow(window: ElectronBrowserWindow) {
  window.on('focus', () => {
    window.webContents.send(IPC_MENU_EVENT_CHANNEL, { commandId: '__menu_focus_sync__' });
  });
}
