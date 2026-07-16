import { BrowserWindow, type WebContents } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { waitForDatabaseReady } from '../database/databaseReadiness.js';

import { handleAssistantCommand } from './assistantCommands.js';
import { resolveCommandRoute, type CommandRouteFamily } from './commandRoutes.js';
import type { InvokeRequest } from './contracts.js';
import { handleImportCommand } from './importCommands.js';
import {
  IPC_REQUEST_PAYLOAD_WARNING_BYTES,
  IPC_RESPONSE_PAYLOAD_WARNING_BYTES,
  recordIpcPayloadBudget
} from './ipcPayloadBudget.js';
import { handleReviewCommand } from './reviewCommands.js';
import { handleStorageCommand } from './storageCommands.js';
import { handleDesktopUpdateCommand } from './updateCommands.js';
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
  recordIpcPayloadBudget({
    budgetBytes: IPC_REQUEST_PAYLOAD_WARNING_BYTES,
    command,
    direction: 'request',
    payload: { command, args }
  });
  const route = resolveCommandRoute(command);
  if (!route) {
    throwUnsupportedCommand(command);
  }
  if (shouldWaitForDatabaseReady(command, route)) {
    await waitForDatabaseReady();
  }

  const result = await dispatchRoutedCommand(route, request, args, context);
  if (result !== undefined) {
    recordIpcPayloadBudget({
      budgetBytes: IPC_RESPONSE_PAYLOAD_WARNING_BYTES,
      command,
      direction: 'response',
      payload: result
    });
    return result;
  }
  throwUnsupportedCommand(command);
}

function shouldWaitForDatabaseReady(command: string, route: CommandRouteFamily) {
  return command !== NATIVE_COMMANDS.bootReport && route !== 'assistant' && route !== 'update' && route !== 'windowAndUtility';
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
  if (route === 'assistant') {
    return handleAssistantCommand(request.command, args, context?.sender);
  }
  if (route === 'storage') {
    return handleStorageCommand(request.command, args, resolveTargetWindow(context));
  }
  if (route === 'windowAndUtility') {
    return handleWindowAndUtilityCommand(request, context);
  }
  if (route === 'update') {
    return handleDesktopUpdateCommand(request, context);
  }
  return handleReviewCommand(request);
}
