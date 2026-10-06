// OS app paths are isolated; database, authentication and sync code remain production code.
import path from 'node:path';
const root = process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT!;
export const app = {
  getPath: (name: string) => path.join(root, name === 'userData' ? 'data' : name),
  getVersion: () => '0.7.14', isPackaged: false,
  on: () => undefined, commandLine: { appendSwitch: () => undefined }
};
export const windowEvents: Array<{ channel: string; payload: unknown }> = [];
const window = { isDestroyed: () => false, webContents: {
  isDestroyed: () => false,
  send: (channel: string, payload: unknown) => windowEvents.push({ channel, payload })
} };
export const BrowserWindow = { getAllWindows: () => [window], getFocusedWindow: () => null };
export const Notification = class { static isSupported() { return false; } };
export const shell = { trashItem: async () => { throw new Error('test must not trash files'); } };
export const nativeTheme = {};
export const dialog = {};
export const clipboard = {};
export const screen = {};
export const safeStorage = {};
export const session = {};
export const ipcMain = {};
export const Menu = {};
export const powerMonitor = {};
export const net = {};
export const protocol = {};
export const systemPreferences = {};
