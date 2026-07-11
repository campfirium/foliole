import { EventEmitter } from 'node:events';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { resolvePackagedUninstallerPath, uninstallPackagedApp } from './uninstall-packaged-app.mjs';

it('resolves the per-user Foliole uninstaller or an explicit verification override', () => {
  expect(resolvePackagedUninstallerPath({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }))
    .toBe(path.join('C:\\Users\\me\\AppData\\Local', 'Programs', 'Foliole', 'Uninstall Foliole.exe'));
  expect(resolvePackagedUninstallerPath({ FOLIOLE_UNINSTALLER_PATH: 'D:\\Apps\\uninstall.exe' }))
    .toBe(path.resolve('D:\\Apps\\uninstall.exe'));
});

it('runs only the resolved uninstaller in silent mode', async () => {
  const child = new EventEmitter();
  const spawn = vi.fn(() => child);
  const promise = uninstallPackagedApp({ exists: () => true, spawn, uninstallerPath: 'D:\\Apps\\uninstall.exe' });
  child.emit('exit', 0);
  await promise;
  expect(spawn).toHaveBeenCalledWith('D:\\Apps\\uninstall.exe', ['/currentuser', '/S'], { stdio: 'inherit' });
});
