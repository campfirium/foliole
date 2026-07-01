// @vitest-environment node

import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appPath: '/app',
  isPackaged: false as boolean,
  appQuit: vi.fn(),
  appendMainProcessDiagnosticLog: vi.fn(),
  createFromPath: vi.fn((path: string): { isEmpty: () => boolean; path: string } => ({
    isEmpty: (): boolean => false,
    path
  })),
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
  app: {
    getAppPath: () => mocks.appPath,
    get isPackaged() {
      return mocks.isPackaged;
    },
    quit: mocks.appQuit
  },
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
vi.mock('./diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: mocks.appendMainProcessDiagnosticLog
}));

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.appPath = '/app';
  mocks.isPackaged = false;
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
  expect(mocks.createFromPath).toHaveBeenCalledWith(path.join('/app', 'build', 'icon.ico'));
  expect(tray.setToolTip).toHaveBeenCalledWith('Foliole');
  const menu = tray.menu as Array<{ click?: () => void; label?: string }>;
  expect(menu.map((item) => item.label).filter(Boolean)).toEqual(['Open Foliole', 'Quit Foliole']);

  menu[0]!.click?.();
  expect(openMainWindow).toHaveBeenCalledTimes(1);
  menu[2]!.click?.();
  expect(isAppQuittingForBackgroundPresence()).toBe(true);
  expect(mocks.appQuit).toHaveBeenCalledTimes(1);
});

it('single-click toggles the current main window before creating a new one', async () => {
  let visible = false;
  const window = {
    hide: vi.fn(() => {
      visible = false;
    }),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    show: vi.fn(() => {
      visible = true;
    })
  };
  const openMainWindow = vi.fn().mockResolvedValue(null);
  const { installBackgroundTray } = await import('./backgroundPresence.js');

  installBackgroundTray({
    getMainWindow: () => window as never,
    openMainWindow,
    platform: 'win32'
  });

  mocks.trayInstances[0]!.handlers.get('click')?.();

  expect(window.show).toHaveBeenCalledTimes(1);
  expect(mocks.focusWindow).toHaveBeenCalledWith(window);
  expect(openMainWindow).not.toHaveBeenCalled();

  mocks.trayInstances[0]!.handlers.get('click')?.();

  expect(window.hide).toHaveBeenCalledTimes(1);
  expect(openMainWindow).not.toHaveBeenCalled();
});

it('uses the installed Windows resource icon outside the app asar', async () => {
  const originalResourcesPath = process.resourcesPath;
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: '/installed/resources'
  });
  mocks.isPackaged = true;
  const { installBackgroundTray } = await import('./backgroundPresence.js');

  installBackgroundTray({
    getMainWindow: () => null,
    openMainWindow: vi.fn().mockResolvedValue(null),
    platform: 'win32'
  });

  expect(mocks.createFromPath).toHaveBeenCalledWith(path.join('/installed/resources', 'build', 'icon.ico'));
  expect(mocks.trayInstances).toHaveLength(1);

  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    value: originalResourcesPath
  });
});

it('does not install a transparent tray when the icon cannot be decoded', async () => {
  mocks.createFromPath.mockReturnValueOnce({ isEmpty: () => true, path: '/app/build/icon.ico' });
  const { installBackgroundTray } = await import('./backgroundPresence.js');

  installBackgroundTray({
    getMainWindow: () => null,
    openMainWindow: vi.fn().mockResolvedValue(null),
    platform: 'win32'
  });

  expect(mocks.trayInstances).toHaveLength(0);
  expect(mocks.appendMainProcessDiagnosticLog).toHaveBeenCalledWith('tray_icon_empty', {
    icon_path: path.join('/app', 'build', 'icon.ico'),
    is_packaged: false,
    platform: 'win32'
  });
});
