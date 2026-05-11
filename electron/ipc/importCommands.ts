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
import { runReadwiseReaderImport } from '../import/readwiseReaderImportRun.js';
import { previewReadwiseReaderImport } from '../import/readwiseSyncPreview.js';

import { asString } from './commandParsers.js';
import type { InvokeContext } from './commands.js';
import type { InvokeRequest } from './contracts.js';
import { runClipboardImport } from './importClipboard.js';
import { runDirectoryImport } from './importDirectory.js';
import { runImportForFilePath, runTextFileImport, selectImportTextFile } from './importTextFile.js';
import { inspectReadwiseReaderSetup } from './readwiseReaderSetup.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

function resolveNativeHighlightPolicy(value: unknown) {
  return value === 'adopt' ? 'adopt' : 'reference_only';
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
  result: Awaited<ReturnType<typeof runTextFileImport>> | Awaited<ReturnType<typeof runImportForFilePath>>
) {
  if (result?.result_status !== 'failed' && result?.node_id) {
    notifyWorkspaceContentChanged();
  }
}

function notifyIfDirectoryImportChanged(result: Awaited<ReturnType<typeof runDirectoryImport>>) {
  if (result && result.imported_count > 0) {
    notifyWorkspaceContentChanged();
  }
}

async function selectImportDirectory(context?: InvokeContext) {
  const window = resolveTargetWindow(context);
  const selection = window
    ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  return selection.filePaths[0] ?? null;
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
    return previewKeepImportRule({
      directoryPath: asString(args.directory_path, 'directory_path'),
      highlightPolicy: resolveNativeHighlightPolicy(args.highlight_policy),
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
    const result = await runReadwiseReaderImport(args);
    notifyIfReadwiseReaderImportChanged(result);
    return result;
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
    const result = await runTextFileImport(resolveTargetWindow(context), args);
    notifyIfTextImportChanged(result);
    return result;
  }
  if (request.command === NATIVE_COMMANDS.runClipboardImport) {
    const result = await runClipboardImport(args);
    notifyIfTextImportChanged(result);
    return result;
  }
  if (request.command === NATIVE_COMMANDS.runDirectoryImport) {
    const result = await runDirectoryImport(resolveTargetWindow(context), args);
    notifyIfDirectoryImportChanged(result);
    return result;
  }
  if (request.command === NATIVE_COMMANDS.selectImportTextFile) {
    return selectImportTextFile(resolveTargetWindow(context), args);
  }
  if (request.command === NATIVE_COMMANDS.importExternalSearchDocument) {
    const result = await runImportForFilePath(asString(args.absolute_path, 'absolute_path'), args);
    notifyIfTextImportChanged(result);
    return result;
  }
  return undefined;
}
