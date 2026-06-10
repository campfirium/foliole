import type { BrowserWindow } from 'electron';

import {
  buildFloatingThemeStyle,
  type GlobalCaptureFloatingTheme,
  resolveFloatingTheme
} from './globalCaptureFloatingSurface.js';

function buildToastThemeUpdateScript(theme: GlobalCaptureFloatingTheme) {
  return `
    (() => {
      const themeStyle = ${JSON.stringify(buildFloatingThemeStyle(theme))};
      const style = document.querySelector('style[data-capture-theme="true"]') ?? document.querySelector('style');
      if (style) {
        style.textContent = themeStyle;
      }
    })()
  `;
}

export function refreshToastWindowTheme(toastWindow: BrowserWindow) {
  return resolveFloatingTheme(toastWindow)
    .then((theme) => toastWindow.webContents.executeJavaScript(buildToastThemeUpdateScript(theme), true).then(() => theme));
}
