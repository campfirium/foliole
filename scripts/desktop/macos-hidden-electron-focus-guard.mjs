/* global process */

function replaceMethod(target, name, value) {
  if (!target || typeof target[name] !== 'function') {
    throw new Error(`macos_hidden_electron_focus_guard_missing_${name}`);
  }
  Object.defineProperty(target, name, {
    configurable: true,
    value,
    writable: true
  });
}

export function installMacosHiddenElectronFocusGuard({
  BrowserWindow, app, platform = process.platform
}) {
  if (platform !== 'darwin') {
    throw new Error('macos_hidden_electron_focus_guard_platform_invalid');
  }
  const windowPrototype = BrowserWindow?.prototype;
  const setFocusable = windowPrototype?.setFocusable;
  const showInactive = windowPrototype?.showInactive;
  if (typeof setFocusable !== 'function' || typeof showInactive !== 'function') {
    throw new Error('macos_hidden_electron_focus_guard_window_api_invalid');
  }

  replaceMethod(app, 'focus', () => undefined);
  replaceMethod(windowPrototype, 'focus', () => undefined);
  replaceMethod(windowPrototype, 'setFocusable', function keepWindowNonFocusable() {
    return setFocusable.call(this, false);
  });
  const showWithoutActivation = function showWithoutActivation() {
    this.setFocusable(false);
    this.setSkipTaskbar(true);
    this.setIgnoreMouseEvents(true);
    return showInactive.call(this);
  };
  replaceMethod(windowPrototype, 'show', showWithoutActivation);
  replaceMethod(windowPrototype, 'showInactive', showWithoutActivation);
  app.on('web-contents-created', (_event, contents) => {
    if (typeof contents?.focus === 'function') {
      replaceMethod(contents, 'focus', () => undefined);
    }
  });
}
