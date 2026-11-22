import { existsSync } from 'node:fs';
import path from 'node:path';

import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type { NativeLibraryMergeResult, NativeLibraryMergeSource } from '../../lib/platform/nativeLibraryMergeContract.js';
import { mergeDesktopLibrary } from '../import/desktopLibraryMerge.js';

import { asNullableString, asString } from './commandParsers.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

async function showOpenDialog(window: BrowserWindow | null, options: OpenDialogOptions) {
  const selection = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return selection.canceled ? null : selection.filePaths[0] ?? null;
}

/** A library keeps its database in `Data` and its backups in `Backups`; both sit next to its `Assets` folder. */
export function guessLibraryMergeAttachments(sourcePath: string) {
  const candidate = path.join(path.dirname(path.dirname(sourcePath)), 'Assets');
  return existsSync(candidate) ? candidate : null;
}

async function pickSource(window: BrowserWindow | null): Promise<NativeLibraryMergeSource | null> {
  const sourcePath = await showOpenDialog(window, {
    filters: [{ extensions: ['db', 'gz', 'sqlite'], name: 'Foliole library' }],
    properties: ['openFile']
  });
  return sourcePath ? { sourcePath, attachmentsDirectory: guessLibraryMergeAttachments(sourcePath) } : null;
}

async function runMerge(args: Record<string, unknown>): Promise<NativeLibraryMergeResult> {
  const result = await mergeDesktopLibrary({
    sourcePath: asString(args.sourcePath, 'sourcePath'),
    attachmentsDirectory: asNullableString(args.attachmentsDirectory, 'attachmentsDirectory'),
    folderTitle: asString(args.folderTitle, 'folderTitle')
  });
  if (result.added || result.alternatives || result.reviewsAdded) notifyWorkspaceContentChanged(null);
  return result;
}

export function handleLibraryMergeCommand(command: string, args: Record<string, unknown>, window: BrowserWindow | null) {
  if (command === NATIVE_COMMANDS.pickLibraryMergeSource) return pickSource(window);
  if (command === NATIVE_COMMANDS.pickLibraryMergeAttachments) {
    const defaultPath = asNullableString(args.defaultPath ?? null, 'defaultPath');
    return showOpenDialog(window, { properties: ['openDirectory'], ...(defaultPath ? { defaultPath } : {}) });
  }
  if (command === NATIVE_COMMANDS.mergeLibrary) return runMerge(args);
  return undefined;
}
