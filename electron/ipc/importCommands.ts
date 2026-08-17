import { BrowserWindow, dialog } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { previewKeepImportRule } from '../import/keepImportService.js';
import { resetReadwiseBookImport } from '../import/readwiseBookImportReset.js';
import {
  loadReadwiseBookEpub,
  openReadwiseBookDownload
} from '../import/readwiseBookManualActions.js';
import {
  previewReadwiseImportCleanup,
  runReadwiseImportCleanup
} from '../import/readwiseImportCleanup.js';
import { cancelReadwiseReaderImport, runReadwiseReaderImport } from '../import/readwiseReaderImportRun.js';
import { previewReadwiseReaderImport } from '../import/readwiseSyncPreview.js';
import { assertLocalWatchedFolderExecution } from '../import/watchedFolderExecutionGate.js';
import {
  persistSecurityScopedBookmark,
  shouldRequestSecurityScopedBookmarks
} from '../securityScopedBookmarks.js';

import { asString } from './commandParsers.js';
import type { InvokeContext } from './commands.js';
import type { InvokeRequest } from './contracts.js';
import { runClipboardImport } from './importClipboard.js';
import { runDirectoryImport } from './importDirectory.js';
import { assertExternalSearchImportPath, authorizeSelectedImportDirectoryPath } from './importPathAuthorization.js';
import { runImportForFilePath, runImportForMirrorDocument, runTextFileImport, selectImportTextFile } from './importTextFile.js';
import { inspectReadwiseReaderSetup } from './readwiseReaderSetup.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

function resolveNativeHighlightPolicy(value: unknown) {
  return value === 'adopt' ? 'adopt' : 'reference_only';
}

function resolveNativeHighlightMode(value: unknown) {
  return value === 'split' ? 'split' : 'merged';
}

function resolveKeepImportSourceType(value: unknown) {
  return value === 'readwise' ? 'readwise' : 'generic';
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

function notifyIfReadwiseReaderImportChanged(result: Awaited<ReturnType<typeof runReadwiseReaderImport>>) {
  if (result.status === 'completed' && (result.imported_count ?? 0) > 0) {
    notifyWorkspaceContentChanged();
  }
}

function notifyIfTextImportChanged(
  result: Awaited<ReturnType<typeof runTextFileImport>> | Awaited<ReturnType<typeof runImportForFilePath>>,
  originWindow: BrowserWindow | null = null
) {
  if (result?.result_status !== 'failed' && result?.node_id) {
    notifyWorkspaceContentChanged(originWindow);
  }
}

function notifyIfDirectoryImportChanged(result: Awaited<ReturnType<typeof runDirectoryImport>>, originWindow: BrowserWindow | null = null) {
  if (result && result.imported_count > 0) {
    notifyWorkspaceContentChanged(originWindow);
  }
}

async function selectImportDirectory(context?: InvokeContext) {
  const window = resolveTargetWindow(context);
  const selection = window
    ? await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        securityScopedBookmarks: shouldRequestSecurityScopedBookmarks()
      })
    : await dialog.showOpenDialog({
        properties: ['openDirectory'],
        securityScopedBookmarks: shouldRequestSecurityScopedBookmarks()
      });
  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  const selectedPath = selection.filePaths[0] ?? null;
  if (selectedPath) {
    persistSecurityScopedBookmark(selectedPath, selection.bookmarks?.[0]);
    await authorizeSelectedImportDirectoryPath(selectedPath);
  }
  return selectedPath;
}

export async function handleImportCommand(request: InvokeRequest, context?: InvokeContext) {
  const args = (request.args ?? {}) as Record<string, unknown>;

  const readwiseResult = await handleReadwiseImportCommand(request, args, context);
  if (readwiseResult !== undefined) {
    return readwiseResult;
  }
  const textImportResult = await handleTextImportCommand(request, args, context);
  if (textImportResult !== undefined) {
    return textImportResult;
  }
  if (request.command === NATIVE_COMMANDS.previewKeepImportRule) {
    if (resolveKeepImportSourceType(args.source_type) === 'generic') {
      assertLocalWatchedFolderExecution(asString(args.rule_id, 'rule_id'));
    }
    return previewKeepImportRule({
      directoryPath: asString(args.directory_path, 'directory_path'),
      highlightMode: resolveNativeHighlightMode(args.highlight_mode),
      highlightPolicy: resolveNativeHighlightPolicy(args.highlight_policy),
      ...(typeof args.highlight_path === 'string' ? { highlightDirectoryPath: args.highlight_path } : {}),
      ruleId: asString(args.rule_id, 'rule_id'),
      sourceType: resolveKeepImportSourceType(args.source_type)
    });
  }
  if (request.command === NATIVE_COMMANDS.selectImportDirectory) {
    return selectImportDirectory(context);
  }
  return undefined;
}

async function handleReadwiseImportCommand(
  request: InvokeRequest,
  args: Record<string, unknown>,
  context?: InvokeContext
) {
  if (request.command === NATIVE_COMMANDS.inspectReadwiseReaderSetup) {
    return inspectReadwiseReaderSetup(args as Parameters<typeof inspectReadwiseReaderSetup>[0]);
  }
  if (request.command === NATIVE_COMMANDS.previewReadwiseReaderImport) {
    return previewReadwiseReaderImport(args.settings);
  }
  if (request.command === NATIVE_COMMANDS.runReadwiseReaderImport) {
    const result = await runReadwiseReaderImport({ ...args, window: resolveTargetWindow(context) });
    notifyIfReadwiseReaderImportChanged(result);
    return result;
  }
  if (request.command === NATIVE_COMMANDS.cancelReadwiseReaderImport) {
    return cancelReadwiseReaderImport();
  }
  if (request.command === NATIVE_COMMANDS.previewReadwiseImportCleanup) {
    return previewReadwiseImportCleanup();
  }
  if (request.command === NATIVE_COMMANDS.runReadwiseImportCleanup) {
    const result = runReadwiseImportCleanup();
    if (result.deleted_count > 0) {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  if (request.command === NATIVE_COMMANDS.openReadwiseBookDownload) {
    return openReadwiseBookDownload(asString(args.node_id, 'node_id'));
  }
  if (request.command === NATIVE_COMMANDS.loadReadwiseBookEpub) {
    const result = await loadReadwiseBookEpub(asString(args.node_id, 'node_id'), resolveTargetWindow(context));
    if (result.status === 'selected') {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  if (request.command === NATIVE_COMMANDS.resetReadwiseBookImport) {
    const result = await resetReadwiseBookImport(asString(args.node_id, 'node_id'));
    if (result.status === 'reset') {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  if (request.command === NATIVE_COMMANDS.runTextFileImport) {
    return undefined;
  }
  return undefined;
}

async function handleTextImportCommand(
  request: InvokeRequest,
  args: Record<string, unknown>,
  context?: InvokeContext
) {
  if (request.command === NATIVE_COMMANDS.runTextFileImport) {
    const originWindow = resolveTargetWindow(context);
    const result = await runTextFileImport(originWindow, args);
    notifyIfTextImportChanged(result, originWindow);
    return result;
  }
  if (request.command === NATIVE_COMMANDS.runClipboardImport) {
    const originWindow = resolveTargetWindow(context);
    const result = await runClipboardImport(args);
    notifyIfTextImportChanged(result, originWindow);
    return result;
  }
  if (request.command === NATIVE_COMMANDS.runDirectoryImport) {
    const originWindow = resolveTargetWindow(context);
    const result = await runDirectoryImport(originWindow, args);
    notifyIfDirectoryImportChanged(result, originWindow);
    return result;
  }
  if (request.command === NATIVE_COMMANDS.selectImportTextFile) {
    return selectImportTextFile(resolveTargetWindow(context));
  }
  if (request.command === NATIVE_COMMANDS.importExternalSearchDocument) {
    const documentId = typeof args.document_id === 'string' ? args.document_id.trim() : '';
    if (documentId) {
      const result = runImportForMirrorDocument(documentId, args);
      notifyIfTextImportChanged(result, resolveTargetWindow(context));
      return result;
    }
    const filePath = await assertExternalSearchImportPath(asString(args.absolute_path, 'absolute_path'));
    const result = await runImportForFilePath(filePath, args);
    notifyIfTextImportChanged(result, resolveTargetWindow(context));
    return result;
  }
  return undefined;
}
