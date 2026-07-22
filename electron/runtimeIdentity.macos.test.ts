import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { FOLIOLE_APP_NAME, configureRuntimeAppIdentity } from './runtimeIdentity.js';

it('brands an unpackaged macOS development runtime in the Dock', () => {
  const appDataRoot = '/Users/roamer/Library/Application Support';
  const hide = vi.fn();
  const setIcon = vi.fn();
  const app = {
    dock: { hide, setIcon },
    getName: () => FOLIOLE_APP_NAME,
    getPath: (name: 'appData' | 'sessionData' | 'temp' | 'userData') =>
      name === 'appData' ? appDataRoot : path.join(appDataRoot, 'Electron'),
    isPackaged: false,
    setName: vi.fn(),
    setPath: vi.fn()
  };

  configureRuntimeAppIdentity(app, vi.fn(), 'darwin', {
    FOLIOLE_ELECTRON_APP_ROOT: '/repo/foliole'
  });

  expect(hide).not.toHaveBeenCalled();
  expect(setIcon).toHaveBeenCalledWith(path.join(path.resolve('/repo/foliole'), 'build', 'icon-macos.png'));
});
