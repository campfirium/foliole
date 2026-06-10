import path from 'node:path';

import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';

import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import type {
  NativeImportedTextFile,
  NativeTextImportArgs,
  NativeTextImportResult
} from '../../lib/platform/nativeContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';
import { logMainProcessOperationFailure } from '../diagnostics/mainProcessDiagnostics.js';
import { buildImportNodeMutationPatch, withTextImportNodeMutationPatch } from '../import/importNodeMutationPatch.js';
import { notifyManagedInboxUpdated } from '../import/managedInboxEvents.js';

import { loadEpubPreview, runEpubImport } from './epubImport.js';
import {
  assertAuthorizedImportFilePath,
  authorizeSelectedImportFilePaths
} from './importPathAuthorization.js';
import {
  buildPreparedImportRecord,
  importTargetParentNodeProps,
  loadPreparedImportRecord,
  resolveImportHighlightPolicy,
  resolveImportNodeTitleStrategy,
  resolveSingleFileImportSource
} from './importSourcePipeline.js';

export function toNativeTextImportResult(record: PersistedImportRecord): NativeTextImportResult {
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

function getImportFileDialogOptions() {
  return {
    filters: [{ name: 'Markdown / HTML / Text / EPUB / PDF', extensions: ['md', 'markdown', 'html', 'htm', 'txt', 'epub', 'pdf'] }],
    properties: ['openFile', 'multiSelections']
  } satisfies OpenDialogOptions;
}

async function selectImportFilePaths(window?: BrowserWindow | null) {
  const selection = window
    ? await dialog.showOpenDialog(window, getImportFileDialogOptions())
    : await dialog.showOpenDialog(getImportFileDialogOptions());

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  await authorizeSelectedImportFilePaths(selection.filePaths);
  return selection.filePaths;
}

export async function selectImportFilePath(window?: BrowserWindow | null) {
  const filePaths = await selectImportFilePaths(window);
  return filePaths?.[0] ?? null;
}

export async function runImportForFilePath(filePath: string, args?: NativeTextImportArgs) {
  const source = resolveSingleFileImportSource(filePath);
  const importedAt = new Date().toISOString();
  const highlightPolicy = resolveImportHighlightPolicy(args);
  const titleStrategy = resolveImportNodeTitleStrategy(args);

  try {
    if (source.kind === 'epub') {
      return toNativeTextImportResult(
        await runEpubImport(source, importedAt, {
          ...(args?.sequential_reading_mode === 'free' || args?.sequential_reading_mode === 'sequential'
            ? { sequentialReadingMode: args.sequential_reading_mode }
            : {})
        })
      );
    }
    return toNativeTextImportResult(
      runPreparedImport(
        await loadPreparedImportRecord(source, {
          highlightPolicy,
          importedAt,
          sourceTrackingMode: 'untracked',
          ...importTargetParentNodeProps(args),
          titleStrategy
        })
      )
    );
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown import failure';
    logMainProcessOperationFailure('import_file', { source_kind: source.kind }, error, 'Import failed');
    return toNativeTextImportResult(
      recordPreparedImportFailure(
        buildPreparedImportRecord(source, {
          content: '',
          highlightPolicy,
          importedAt,
          sourceTrackingMode: 'untracked',
          ...importTargetParentNodeProps(args),
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
  if (typeof args?.file_path === 'string' && args.file_path.trim()) {
    const filePath = await assertAuthorizedImportFilePath(args.file_path);
    const result = withTextImportNodeMutationPatch(await runImportForFilePath(filePath, args));
    if (result?.import_id) {
      notifyManagedInboxUpdated(result.import_id, result.node_mutation_patch);
    }
    return result;
  }
  const filePaths = await selectImportFilePaths(window);
  if (!filePaths?.length) {
    return null;
  }
  let lastResult: NativeTextImportResult | null = null;
  const results: NativeTextImportResult[] = [];
  for (const filePath of filePaths) {
    lastResult = await runImportForFilePath(filePath, args);
    if (lastResult) {
      results.push(lastResult);
    }
  }
  const patchedResult = withTextImportNodeMutationPatch(lastResult);
  if (patchedResult?.import_id) {
    const nodeMutationPatch = buildImportNodeMutationPatch(results);
    notifyManagedInboxUpdated(patchedResult.import_id, nodeMutationPatch);
    return nodeMutationPatch ? { ...patchedResult, node_mutation_patch: nodeMutationPatch } : patchedResult;
  }
  return patchedResult;
}
