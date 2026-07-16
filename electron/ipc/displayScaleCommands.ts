import { BrowserWindow } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import type { InvokeContext } from './commands.js';
import type { InvokeRequest } from './contracts.js';

function resolveDisplayScalePercent(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 80 || value > 200 || value % 10 !== 0) {
    throw new Error('percent must be an integer from 80 to 200 in steps of 10');
  }
  return value;
}

export function handleDisplayScaleCommand(request: InvokeRequest, context?: InvokeContext) {
  if (request.command !== NATIVE_COMMANDS.setAppDisplayScale) return undefined;
  const args = (request.args ?? {}) as Record<string, unknown>;
  const window = context?.sender
    ? BrowserWindow.fromWebContents(context.sender)
    : BrowserWindow.getFocusedWindow();
  window?.webContents.setZoomFactor(resolveDisplayScalePercent(args.percent) / 100);
  return null;
}
