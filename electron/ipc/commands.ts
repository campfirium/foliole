import { BrowserWindow, type WebContents } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { waitForDatabaseReady } from '../database/databaseReadiness.js';
import { runDesktopDatabaseWrite } from '../database/desktopDatabaseWriteQueue.js';
import { recordNativeCommandFailure } from '../diagnostics/nativeCommandFailureLog.js';
import { recordNativeCommandTiming, type NativeCommandWaits } from '../diagnostics/nativeCommandLoad.js';

import { handleAssistantCommand } from './assistantCommands.js';
import { resolveCommandRoute, type CommandRouteFamily } from './commandRoutes.js';
import type { InvokeRequest } from './contracts.js';
import { isForegroundNodeMutationCommand } from './foregroundNodeMutationCommands.js';
import { handleImportCommand } from './importCommands.js';
import {
  IPC_REQUEST_PAYLOAD_WARNING_BYTES,
  IPC_RESPONSE_PAYLOAD_WARNING_BYTES,
  recordIpcPayloadBudget
} from './ipcPayloadBudget.js';
import { handleReminderCommand } from './reminderCommands.js';
import { handleReminderNotificationCommand } from './reminderNotificationCommands.js';
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
  const startedAt = performance.now();
  const waits: NativeCommandWaits = {};
  try {
    const result = await dispatchInvokeRequest(request, context, waits);
    recordNativeCommandTiming(String(request.command), performance.now() - startedAt, 'done', Date.now(), waits);
    return result;
  } catch (error) {
    recordNativeCommandTiming(String(request.command), performance.now() - startedAt, 'failed', Date.now(), waits);
    await recordNativeCommandFailure(String(request.command), error);
    throw error;
  }
}

async function dispatchInvokeRequest(
  request: InvokeRequest,
  context: InvokeContext | undefined,
  waits: NativeCommandWaits
): Promise<unknown> {
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
    const readyStartedAt = performance.now();
    await waitForDatabaseReady();
    waits.databaseReadyMs = performance.now() - readyStartedAt;
  }

  const result = await dispatchRoutedCommand(route, request, args, context, waits);
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
  return command !== NATIVE_COMMANDS.bootReport &&
    command !== NATIVE_COMMANDS.assistantGetStatus &&
    command !== NATIVE_COMMANDS.assistantStartChatGptLogin &&
    command !== NATIVE_COMMANDS.assistantGetStorageInfo &&
    command !== NATIVE_COMMANDS.assistantOpenStorageLocation &&
    route !== 'update' &&
    route !== 'windowAndUtility';
}

function throwUnsupportedCommand(command: string): never {
  throw new Error(`unsupported native command: ${command}`);
}

function dispatchRoutedCommand(
  route: CommandRouteFamily,
  request: InvokeRequest,
  args: Record<string, unknown>,
  context: InvokeContext | undefined,
  waits: NativeCommandWaits
) {
  if (route === 'import') {
    return handleImportCommand(request, context);
  }
  if (route === 'assistant') {
    return handleAssistantCommand(request.command, args, context?.sender);
  }
  if (route === 'storage') {
    const execute = () => handleReminderCommand(request.command, args) ?? handleStorageCommand(
      request.command, args, resolveTargetWindow(context), context?.sender
    );
    if (isForegroundNodeMutationCommand(request.command)) {
      return runDesktopDatabaseWrite('foreground', execute);
    }
    if (!shouldCoordinateStorageDispatch(request.command, args)) return execute();
    const queuedAt = performance.now();
    return runWithDatabaseConnectionOwner(() => {
      waits.connectionMs = performance.now() - queuedAt;
      return execute();
    });
  }
  if (route === 'windowAndUtility') {
    return handleReminderNotificationCommand(request.command) ?? handleWindowAndUtilityCommand(request, context);
  }
  if (route === 'update') {
    return handleDesktopUpdateCommand(request, context);
  }
  return handleReviewCommand(request);
}

function shouldCoordinateStorageDispatch(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.updateLibraryPathSetting && args.location === 'library_home') {
    return false;
  }
  return !STORAGE_COMMANDS_WITH_INTERNAL_COORDINATION.has(command);
}

const STORAGE_COMMANDS_WITH_INTERNAL_COORDINATION = new Set<string>([
  NATIVE_COMMANDS.exportCurrentArticleMirror,
  NATIVE_COMMANDS.rebuildMirrorOutput,
  // Queues each chunk as its own foreground write.
  NATIVE_COMMANDS.deleteNodesPermanently,
  NATIVE_COMMANDS.flushDirtyNodeSyncVersions,
  NATIVE_COMMANDS.resolveAttachmentResource,
  NATIVE_COMMANDS.activateReadwiseOnThisHost,
  NATIVE_COMMANDS.completeSyncGroupJoin,
  NATIVE_COMMANDS.importRemoteImageAttachment,
  NATIVE_COMMANDS.loadRemoteImageMetadata,
  NATIVE_COMMANDS.startBackupSearch,
  NATIVE_COMMANDS.nextBackupSearch,
  NATIVE_COMMANDS.cancelBackupSearch,
  NATIVE_COMMANDS.compactSqliteDatabase,
  // Takes the connection once per batch.
  NATIVE_COMMANDS.mergeLibrary,
  NATIVE_COMMANDS.connectReadwiseApiFromClipboard,
  NATIVE_COMMANDS.previewReadwiseIdentityBindings,
  NATIVE_COMMANDS.resolveReadwiseJoinDecision,
  NATIVE_COMMANDS.restoreSqliteDatabase,
  NATIVE_COMMANDS.runReadwiseSourceCutover,
  NATIVE_COMMANDS.syncCompanionNow
]);
