import { BrowserWindow, dialog } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { previewKeepImportRule } from '../import/keepImportService.js';
import { resetReadwiseBookImport } from '../import/readwiseBookImportReset.js';
import { loadReadwiseBookEpub, openReadwiseBookDownload } from '../import/readwiseBookManualActions.js';

import { asString } from './commandParsers.js';
import type { InvokeContext } from './commands.js';
import type { InvokeRequest } from './contracts.js';
import { runDirectoryImport } from './importDirectory.js';
import { runTextFileImport, selectImportTextFile } from './importTextFile.js';
import { inspectReadwiseReaderSetup } from './readwiseReaderSetup.js';

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

  if (request.command === NATIVE_COMMANDS.inspectReadwiseReaderSetup) {
    return inspectReadwiseReaderSetup(args as Parameters<typeof inspectReadwiseReaderSetup>[0]);
  }
  if (request.command === NATIVE_COMMANDS.openReadwiseBookDownload) {
    return openReadwiseBookDownload(asString(args.node_id, 'node_id'));
  }
  if (request.command === NATIVE_COMMANDS.loadReadwiseBookEpub) {
    return loadReadwiseBookEpub(asString(args.node_id, 'node_id'), resolveTargetWindow(context));
  }
  if (request.command === NATIVE_COMMANDS.resetReadwiseBookImport) {
    return resetReadwiseBookImport(asString(args.node_id, 'node_id'));
  }
  if (request.command === NATIVE_COMMANDS.runTextFileImport) {
    return runTextFileImport(resolveTargetWindow(context), args);
  }
  if (request.command === NATIVE_COMMANDS.runDirectoryImport) {
    return runDirectoryImport(resolveTargetWindow(context), args);
  }
  if (request.command === NATIVE_COMMANDS.previewKeepImportRule) {
    return previewKeepImportRule({
      directoryPath: asString(args.directory_path, 'directory_path'),
      highlightPolicy: resolveNativeHighlightPolicy(args.highlight_policy),
      ruleId: asString(args.rule_id, 'rule_id'),
      sourceType: resolveKeepImportSourceType(args.source_type)
    });
  }
  if (request.command === NATIVE_COMMANDS.selectImportTextFile) {
    return selectImportTextFile(resolveTargetWindow(context), args);
  }
  if (request.command === NATIVE_COMMANDS.selectImportDirectory) {
    return selectImportDirectory(context);
  }
  return undefined;
}
