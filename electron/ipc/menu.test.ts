import { beforeEach, describe, expect, it, vi } from 'vitest';

const { menuMock } = vi.hoisted(() => ({
  menuMock: {
    applicationMenu: null as { items: unknown[] } | null,
    buildFromTemplate: vi.fn(),
    setApplicationMenu: vi.fn()
  }
}));

vi.mock('electron', () => ({
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
    expect(findMenuItem(items, 'workspace.toggleDevTools')).toMatchObject({ enabled: false });
    expect(findMenuItem(items, 'workspace.toggleDevTools')).not.toHaveProperty('accelerator');
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
    expect(findMenuItem(items, 'app.redo')).toMatchObject({ enabled: false });
    expect(findMenuItem(items, 'app.redo')).not.toHaveProperty('role');
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
