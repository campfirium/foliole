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
  submenu?: { items: MockMenuItem[] };
}

function toMenuItem(item: Record<string, unknown>): MockMenuItem {
  return {
    ...(item.accelerator === undefined ? {} : { accelerator: item.accelerator as string | null }),
    ...(item.enabled === undefined ? {} : { enabled: item.enabled as boolean }),
    ...(item.id === undefined ? {} : { id: item.id as string }),
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

describe('native app menu', () => {
  beforeEach(() => {
    menuMock.applicationMenu = null;
    menuMock.buildFromTemplate.mockImplementation((template: Record<string, unknown>[]) => ({
      items: template.map((item) => toMenuItem(item))
    }));
    menuMock.setApplicationMenu.mockImplementation((menu: { items: unknown[] }) => {
      menuMock.applicationMenu = menu;
    });
  });

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
    expect(findMenuItem(items, 'workspace.toggleDevTools')).toMatchObject({ accelerator: null, enabled: false });
  });
});
