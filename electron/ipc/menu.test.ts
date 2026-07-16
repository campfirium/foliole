import { beforeEach, describe, expect, it, vi } from 'vitest';

const { appMock, menuMock } = vi.hoisted(() => ({
  appMock: { isPackaged: false },
  menuMock: {
    applicationMenu: null as { items: unknown[] } | null,
    buildFromTemplate: vi.fn(),
    setApplicationMenu: vi.fn()
  }
}));

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: {
    getFocusedWindow: vi.fn()
  },
  Menu: menuMock
}));

import { installAppMenu, syncAppMenuState } from './menu.js';

interface MockMenuItem {
  accelerator?: string | null;
  enabled?: boolean;
  id?: string;
  role?: string;
  submenu?: { items: MockMenuItem[] };
}

function toMenuItem(item: Record<string, unknown>): MockMenuItem {
  return {
    ...(item.accelerator === undefined ? {} : { accelerator: item.accelerator as string | null }),
    ...(item.enabled === undefined ? {} : { enabled: item.enabled as boolean }),
    ...(item.id === undefined ? {} : { id: item.id as string }),
    ...(item.role === undefined ? {} : { role: item.role as string }),
    ...(Array.isArray(item.submenu)
      ? { submenu: { items: item.submenu.map((child) => toMenuItem(child as Record<string, unknown>)) } }
      : {})
  };
}

function findMenuItem(items: MockMenuItem[], id: string): MockMenuItem | null {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }
    const match = item.submenu ? findMenuItem(item.submenu.items, id) : null;
    if (match) {
      return match;
    }
  }
  return null;
}

function resetMenuMock() {
  vi.clearAllMocks();
  appMock.isPackaged = false;
  menuMock.applicationMenu = null;
  menuMock.buildFromTemplate.mockImplementation((template: Record<string, unknown>[]) => ({
    items: template.map((item) => toMenuItem(item))
  }));
  menuMock.setApplicationMenu.mockImplementation((menu: { items: unknown[] }) => {
    menuMock.applicationMenu = menu;
  });
}

describe('native app menu command state', () => {
  beforeEach(resetMenuMock);

  it('syncs enabled state and accelerators onto registered command menu items', () => {
    installAppMenu();

    syncAppMenuState(
      ['editor.toggleImmersiveMode', 'nodes.enterPriorityMode'],
      [
        { accelerator: 'F11', commandId: 'editor.toggleImmersiveMode' },
        { accelerator: 'Control+M', commandId: 'nodes.enterPriorityMode' }
      ]
    );

    const items = (menuMock.applicationMenu?.items ?? []) as MockMenuItem[];
    expect(findMenuItem(items, 'editor.toggleImmersiveMode')).toMatchObject({ accelerator: 'F11', enabled: true });
    expect(findMenuItem(items, 'nodes.enterPriorityMode')).toMatchObject({ accelerator: 'Control+M', enabled: true });
    expect(findMenuItem(items, 'workspace.openGuidedSample')).toMatchObject({ enabled: false });
    expect(findMenuItem(items, 'release.checkForUpdates')).toMatchObject({ enabled: false });
    expect(findMenuItem(items, 'support.sendFeedback')).toMatchObject({ enabled: false });
    expect(findMenuItem(items, 'support.email')).toMatchObject({ enabled: false });
    expect(findMenuItem(items, 'support.openIssues')).toMatchObject({ enabled: false });
    expect(findMenuItem(items, 'workspace.toggleDevTools')).toMatchObject({ enabled: false });
    expect(findMenuItem(items, 'workspace.toggleDevTools')).not.toHaveProperty('accelerator');
  });

  it('omits the DevTools menu entry from packaged app menus', () => {
    appMock.isPackaged = true;

    installAppMenu();

    const items = (menuMock.applicationMenu?.items ?? []) as MockMenuItem[];
    expect(findMenuItem(items, 'workspace.toggleDevTools')).toBeNull();
  });

  it('exposes undo and redo as app commands instead of Electron native roles', () => {
    syncAppMenuState(
      ['app.undo'],
      [
        { accelerator: 'Control+Z', commandId: 'app.undo' },
        { accelerator: 'Control+Y', commandId: 'app.redo' }
      ]
    );

    const items = (menuMock.applicationMenu?.items ?? []) as MockMenuItem[];
    expect(findMenuItem(items, 'app.undo')).toMatchObject({ accelerator: 'Control+Z', enabled: true });
    expect(findMenuItem(items, 'app.undo')).not.toHaveProperty('role');
    expect(findMenuItem(items, 'app.redo')).toMatchObject({ enabled: true });
    expect(findMenuItem(items, 'app.redo')).not.toHaveProperty('role');
  });

  it('adds standard application, edit, and window roles on macOS', () => {
    installAppMenu('darwin');

    const items = (menuMock.applicationMenu?.items ?? []) as MockMenuItem[];
    expect(items.slice(0, 3).map((item) => item.role)).toEqual(['appMenu', 'editMenu', 'windowMenu']);
    expect(findMenuItem(items, 'workspace.openSettings')).not.toBeNull();
    expect(findMenuItem(items, 'localFile.open')).not.toBeNull();
  });

  it('does not add macOS standard roles to the Windows menu', () => {
    installAppMenu('win32');

    const items = (menuMock.applicationMenu?.items ?? []) as MockMenuItem[];
    expect(items.some((item) => item.role === 'appMenu' || item.role === 'editMenu' || item.role === 'windowMenu')).toBe(false);
  });
});

describe('native View menu', () => {
  beforeEach(resetMenuMock);

  it('exposes focused panel content sizing with synchronized state', () => {
    syncAppMenuState(
      ['view.increaseContentRegionScale'],
      [{ accelerator: 'CommandOrControl+=', commandId: 'view.increaseContentRegionScale' }]
    );
    const items = (menuMock.applicationMenu?.items ?? []) as MockMenuItem[];
    expect(findMenuItem(items, 'view.increaseContentRegionScale')).toMatchObject({
      accelerator: 'CommandOrControl+=', enabled: true
    });
    expect(findMenuItem(items, 'view.decreaseContentRegionScale')).toMatchObject({ enabled: false });
    expect(findMenuItem(items, 'view.resetContentRegionScale')).toMatchObject({ enabled: false });
  });
});

describe('native app menu rebuilding', () => {
  beforeEach(resetMenuMock);

  it('rebuilds menu items instead of mutating read-only accelerators', () => {
    menuMock.buildFromTemplate.mockImplementation((template: Record<string, unknown>[]) => {
      const menu = { items: template.map((item) => toMenuItem(item)) };
      const target = findMenuItem(menu.items, 'editor.toggleImmersiveMode');
      if (target) {
        Object.defineProperty(target, 'accelerator', {
          configurable: true,
          value: null,
          writable: false
        });
      }
      return menu;
    });

    installAppMenu();

    expect(() =>
      syncAppMenuState(
        ['editor.toggleImmersiveMode'],
        [{ accelerator: 'F11', commandId: 'editor.toggleImmersiveMode' }]
      )
    ).not.toThrow();
    expect(menuMock.setApplicationMenu).toHaveBeenCalledTimes(2);
  });
});
