import { BrowserWindow, type WebContents } from 'electron';

import { handleCompanionPairingCommand } from './companionPairingCommands.js';
import type { InvokeRequest } from './contracts.js';
import { handleImportCommand } from './importCommands.js';
import { handleReviewCommand } from './reviewCommands.js';
import { handleStorageCommand } from './storageCommands.js';
import { handleWindowAndUtilityCommand } from './windowCommands.js';

export interface InvokeContext {
  sender?: WebContents;
}

function resolveTargetWindow(context?: InvokeContext) {
  if (context?.sender) {
    const window = BrowserWindow.fromWebContents(context.sender);
    if (window) {
      return window;
    }
  }
  return BrowserWindow.getFocusedWindow();
}

export async function handleInvokeRequest(request: InvokeRequest, context?: InvokeContext): Promise<unknown> {
  const command = request.command;
  const args = (request.args ?? {}) as Record<string, unknown>;
  const handlers = [
    () => handleCompanionPairingCommand(command, args),
    () => handleImportCommand(request, context),
    () => handleStorageCommand(command, args, resolveTargetWindow(context)),
    () => handleWindowAndUtilityCommand(request, context),
    () => handleReviewCommand(request)
  ];

  for (const resolve of handlers) {
    const result = await resolve();
    if (result !== undefined) {
      return result;
    }
  }

  throw new Error(`unsupported native command: ${command}`);
}
