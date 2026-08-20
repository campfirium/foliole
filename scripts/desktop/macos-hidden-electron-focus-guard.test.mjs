// @vitest-environment node

import { EventEmitter } from 'node:events';

import { expect, it, vi } from 'vitest';

import { installMacosHiddenElectronFocusGuard } from './macos-hidden-electron-focus-guard.mjs';

function createElectronDoubles() {
  class BaseWindow {
    setFocusable(value) {
      this.focusableValues.push(value);
    }
  }
  class BrowserWindow extends BaseWindow {
    constructor() {
      super();
      this.focusableValues = [];
      this.setIgnoreMouseEvents = vi.fn();
      this.setSkipTaskbar = vi.fn();
    }

    focus() {
      throw new Error('window focus must be suppressed');
    }

    show() {
      throw new Error('activating show must be suppressed');
    }

    showInactive() {
      this.showInactiveCalled = true;
    }
  }
  const app = Object.assign(new EventEmitter(), {
    focus: vi.fn(),
    setActivationPolicy: vi.fn()
  });
  return { app, BrowserWindow };
}

it('keeps every controller window non-activating when product pairing requests ask to focus it', () => {
  const { app, BrowserWindow } = createElectronDoubles();
  installMacosHiddenElectronFocusGuard({ app, BrowserWindow, platform: 'darwin' });
  const window = new BrowserWindow();

  window.show();
  window.showInactive();
  window.focus();
  app.focus();

  expect(app.setActivationPolicy).toHaveBeenCalledWith('accessory');
  expect(window.focusableValues).toEqual([false, false]);
  expect(window.setSkipTaskbar).toHaveBeenCalledTimes(2);
  expect(window.setIgnoreMouseEvents).toHaveBeenCalledTimes(2);
  expect(window.showInactiveCalled).toBe(true);
});

it('suppresses renderer focus requests for controller-created web contents', () => {
  const { app, BrowserWindow } = createElectronDoubles();
  const originalFocus = vi.fn();
  const contents = { focus: originalFocus };
  installMacosHiddenElectronFocusGuard({ app, BrowserWindow, platform: 'darwin' });

  app.emit('web-contents-created', {}, contents);
  contents.focus();

  expect(originalFocus).not.toHaveBeenCalled();
});
