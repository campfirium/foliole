import { BrowserWindow, type WebContents } from 'electron';

import { resolveCommandRoute, type CommandRouteFamily } from './commandRoutes.js';
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
  const route = resolveCommandRoute(command);
  if (!route) {
    throwUnsupportedCommand(command);
  }

  const result = await dispatchRoutedCommand(route, request, args, context);
  if (result !== undefined) {
    return result;
  }
  throwUnsupportedCommand(command);
}

function throwUnsupportedCommand(command: string): never {
  throw new Error(`unsupported native command: ${command}`);
}

function dispatchRoutedCommand(
  route: CommandRouteFamily,
  request: InvokeRequest,
  args: Record<string, unknown>,
  context?: InvokeContext
) {
  if (route === 'import') {
    return handleImportCommand(request, context);
  }
  if (route === 'storage') {
    return handleStorageCommand(request.command, args, resolveTargetWindow(context));
  }
  if (route === 'windowAndUtility') {
    return handleWindowAndUtilityCommand(request, context);
  }
  return handleReviewCommand(request);
}
