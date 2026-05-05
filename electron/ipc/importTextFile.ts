import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import type {
  NativeImportedTextFile,
  NativeTextImportArgs,
  NativeTextImportResult
} from '../../lib/platform/nativeContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';

import {
  buildPreparedImportRecord,
  loadPreparedImportRecord,
  resolveImportHighlightPolicy,
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

async function selectImportFilePath(window?: BrowserWindow | null) {
  const selection = window
    ? await dialog.showOpenDialog(window, {
        filters: [{ name: 'Markdown / HTML / Text / EPUB', extensions: ['md', 'markdown', 'html', 'htm', 'txt', 'epub'] }],
        properties: ['openFile']
      })
    : await dialog.showOpenDialog({
        filters: [{ name: 'Markdown / HTML / Text / EPUB', extensions: ['md', 'markdown', 'html', 'htm', 'txt', 'epub'] }],
        properties: ['openFile']
      });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  return selection.filePaths[0] ?? null;
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
  const prepared = await loadPreparedImportRecord(source, {
    highlightPolicy: resolveImportHighlightPolicy(args),
    importedAt: new Date().toISOString()
  });

  return {
    content: prepared.content,
    file_name: path.basename(filePath),
    file_path: filePath,
    kind: source.kind
  };
}

export async function runTextFileImport(
  window?: BrowserWindow | null,
  args?: NativeTextImportArgs
): Promise<NativeTextImportResult | null> {
  const filePath = await selectImportFilePath(window);
  if (!filePath) {
    return null;
  }

  const source = resolveSingleFileImportSource(filePath);
  const importedAt = new Date().toISOString();
  const highlightPolicy = resolveImportHighlightPolicy(args);

  try {
    return toNativeTextImportResult(runPreparedImport(await loadPreparedImportRecord(source, { highlightPolicy, importedAt })));
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown import failure';
    return toNativeTextImportResult(
      recordPreparedImportFailure(
        buildPreparedImportRecord(source, { content: '', highlightPolicy, importedAt }),
        failureReason
      )
    );
  }
}
