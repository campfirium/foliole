// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appQuit: vi.fn(),
  createFromPath: vi.fn((path: string) => ({ path })),
  focusWindow: vi.fn(),
  trayInstances: [] as Array<{
    destroy: ReturnType<typeof vi.fn>;
    handlers: Map<string, () => void>;
    menu: unknown;
    setContextMenu: ReturnType<typeof vi.fn>;
    setToolTip: ReturnType<typeof vi.fn>;
  }>
}));

vi.mock('electron', () => ({
  app: { quit: mocks.appQuit },
  Menu: {
    buildFromTemplate: vi.fn((template) => template)
  },
  nativeImage: {
    createFromPath: mocks.createFromPath
  },
  Tray: vi.fn(function Tray() {
    const tray = {
      destroy: vi.fn(),
      handlers: new Map<string, () => void>(),
      menu: null as unknown,
      setContextMenu: vi.fn((menu: unknown) => {
        tray.menu = menu;
      }),
      setToolTip: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        tray.handlers.set(event, handler);
      })
    };
    mocks.trayInstances.push(tray);
    return tray;
  })
}));
vi.mock('./runtimeMainSupport.js', () => ({
  focusWindow: mocks.focusWindow
}));

beforeEach(async () => {
  vi.clearAllMocks();
  const { resetBackgroundPresenceForTests } = await import('./backgroundPresence.js');
  resetBackgroundPresenceForTests();
  mocks.trayInstances.length = 0;
});

it('installs a minimal Windows tray with open and quit actions', async () => {
  const openMainWindow = vi.fn().mockResolvedValue(null);
  const { installBackgroundTray, isAppQuittingForBackgroundPresence } = await import('./backgroundPresence.js');

  installBackgroundTray({
    getMainWindow: () => null,
    openMainWindow,
    platform: 'win32'
  });

  const tray = mocks.trayInstances[0]!;
  expect(tray.setToolTip).toHaveBeenCalledWith('Foliole');
  const menu = tray.menu as Array<{ click?: () => void; label?: string }>;
  expect(menu.map((item) => item.label).filter(Boolean)).toEqual(['Open Foliole', 'Quit Foliole']);

  menu[0]!.click?.();
  expect(openMainWindow).toHaveBeenCalledTimes(1);
  menu[2]!.click?.();
  expect(isAppQuittingForBackgroundPresence()).toBe(true);
  expect(mocks.appQuit).toHaveBeenCalledTimes(1);
});

it('double-click restores the current main window before creating a new one', async () => {
  const window = {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    show: vi.fn()
  };
  const openMainWindow = vi.fn().mockResolvedValue(null);
  const { installBackgroundTray } = await import('./backgroundPresence.js');

  installBackgroundTray({
    getMainWindow: () => window as never,
    openMainWindow,
    platform: 'win32'
  });

  mocks.trayInstances[0]!.handlers.get('double-click')?.();

  expect(window.show).toHaveBeenCalledTimes(1);
  expect(mocks.focusWindow).toHaveBeenCalledWith(window);
  expect(openMainWindow).not.toHaveBeenCalled();
});
