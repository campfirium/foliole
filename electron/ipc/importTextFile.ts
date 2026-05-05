import path from 'node:path';

import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';

import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import type {
  NativeImportedTextFile,
  NativeTextImportArgs,
  NativeTextImportResult
} from '../../lib/platform/nativeContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';
import { notifyManagedInboxUpdated } from '../import/managedInboxEvents.js';

import { loadEpubPreview, runEpubImport } from './epubImport.js';
import {
  buildPreparedImportRecord,
  loadPreparedImportRecord,
  resolveImportHighlightPolicy,
  resolveImportNodeTitleStrategy,
  resolveSingleFileImportSource
} from './importSourcePipeline.js';

function toNativeTextImportResult(record: PersistedImportRecord): NativeTextImportResult {
  return {
    content_fingerprint: record.contentFingerprint,
    degraded_reason: record.degradedReason,
    duplicate_semantic: record.duplicateSemantic,
    failure_reason: record.failureReason,
    import_id: record.importId,
    imported_at: record.importedAt,
    node_id: record.nodeId,
    provider: record.provider,
    result_status: record.resultStatus,
    source_fingerprint: record.sourceFingerprint,
    source_kind: record.sourceKind,
    source_locator: record.sourceLocator,
    source_name: record.sourceName
  };
}

export function getImportFileDialogOptions() {
  return {
    filters: [{ name: 'Markdown / HTML / Text / EPUB / PDF', extensions: ['md', 'markdown', 'html', 'htm', 'txt', 'epub', 'pdf'] }],
    properties: ['openFile', 'multiSelections']
  } satisfies OpenDialogOptions;
}

export async function selectImportFilePaths(window?: BrowserWindow | null) {
  const selection = window
    ? await dialog.showOpenDialog(window, getImportFileDialogOptions())
    : await dialog.showOpenDialog(getImportFileDialogOptions());

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  return selection.filePaths;
}

export async function selectImportFilePath(window?: BrowserWindow | null) {
  const filePaths = await selectImportFilePaths(window);
  return filePaths?.[0] ?? null;
}

async function runImportForFilePath(filePath: string, args?: NativeTextImportArgs) {
  const source = resolveSingleFileImportSource(filePath);
  const importedAt = new Date().toISOString();
  const highlightPolicy = resolveImportHighlightPolicy(args);
  const titleStrategy = resolveImportNodeTitleStrategy(args);

  try {
    if (source.kind === 'epub') {
      return toNativeTextImportResult(await runEpubImport(source, importedAt));
    }
    return toNativeTextImportResult(
      runPreparedImport(
        await loadPreparedImportRecord(source, {
          highlightPolicy,
          importedAt,
          sourceTrackingMode: 'untracked',
          titleStrategy
        })
      )
    );
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown import failure';
    return toNativeTextImportResult(
      recordPreparedImportFailure(
        buildPreparedImportRecord(source, {
          content: '',
          highlightPolicy,
          importedAt,
          sourceTrackingMode: 'untracked',
          titleStrategy
        }),
        failureReason
      )
    );
  }
}

export async function selectImportTextFile(
  window?: BrowserWindow | null,
  args?: NativeTextImportArgs
): Promise<NativeImportedTextFile | null> {
  const filePath = await selectImportFilePath(window);
  if (!filePath) {
    return null;
  }
  const source = resolveSingleFileImportSource(filePath);
  const content =
    source.kind === 'epub'
      ? await loadEpubPreview(source)
      : (
          await loadPreparedImportRecord(source, {
            highlightPolicy: resolveImportHighlightPolicy(args),
            importedAt: new Date().toISOString(),
            titleStrategy: resolveImportNodeTitleStrategy(args)
          })
        ).content;

  return {
    content,
    file_name: path.basename(filePath),
    file_path: filePath,
    kind: source.kind
  };
}

export async function runTextFileImport(
  window?: BrowserWindow | null,
  args?: NativeTextImportArgs
): Promise<NativeTextImportResult | null> {
  const filePaths = await selectImportFilePaths(window);
  if (!filePaths?.length) {
    return null;
  }
  let lastResult: NativeTextImportResult | null = null;
  for (const filePath of filePaths) {
    lastResult = await runImportForFilePath(filePath, args);
    if (lastResult?.import_id) {
      notifyManagedInboxUpdated(lastResult.import_id);
    }
  }
  return lastResult;
}
