import { createHash } from 'node:crypto';
import path from 'node:path';

import { clipboard } from 'electron';

import { decideClipboardPasteSource } from '../../lib/clipboard/clipboardPasteSource.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import type { NativeTextImportArgs, NativeTextImportResult } from '../../lib/platform/nativeContract.js';
import { importImageAttachmentBytes, normalizeImageFileName } from '../attachments/importImageAttachmentBytes.js';
import { openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import {
  createLocalImageInboxMarkdown,
  createUnsupportedLocalImageMessage,
  resolveLocalImageInboxImportMode,
  validateLocalImageInboxFile
} from '../import/localImageInboxSource.js';
import { notifyManagedInboxUpdated } from '../import/managedInboxEvents.js';

import { collectClipboardFilePaths } from './clipboardFilePaths.js';
import { resolveClipboardTextSourceName } from './clipboardTextSourceName.js';
import { buildPreparedImportRecord, importTargetParentNodeProps, resolveImportHighlightPolicy, resolveImportKind, resolveImportNodeTitleStrategy, toImportPayload } from './importSourcePipeline.js';
import { runImportForFilePath, toNativeTextImportResult } from './importTextFile.js';

function createContentHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canImportTextFilePath(filePath: string) {
  try {
    resolveImportKind(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runLocalImageFileImport(filePath: string, args?: NativeTextImportArgs) {
  const importedAt = new Date().toISOString();
  const importMode = resolveLocalImageInboxImportMode(filePath);
  if (importMode === 'unsupported_local_image') {
    throw new Error(createUnsupportedLocalImageMessage());
  }
  if (importMode !== 'local_image') {
    return null;
  }
  const imageValidationFailure = await validateLocalImageInboxFile(filePath);
  if (imageValidationFailure) {
    throw new Error(imageValidationFailure);
  }
  const source = {
    filePath,
    kind: 'markdown' as const,
    sourceName: path.basename(filePath)
  };
  return toNativeTextImportResult(
    runPreparedImport(
      buildPreparedImportRecord(source, {
        content: createLocalImageInboxMarkdown(filePath),
        highlightPolicy: resolveImportHighlightPolicy(args),
        importedAt,
        sourceTrackingMode: 'untracked',
        ...importTargetParentNodeProps(args),
        titleStrategy: resolveImportNodeTitleStrategy(args)
      })
    )
  );
}

async function runClipboardFileImport(filePaths: string[], args?: NativeTextImportArgs) {
  let lastResult: NativeTextImportResult | null = null;
  for (const filePath of filePaths) {
    if (canImportTextFilePath(filePath)) {
      lastResult = await runImportForFilePath(filePath, args);
    } else {
      lastResult = await runLocalImageFileImport(filePath, args);
    }
    if (lastResult?.import_id) {
      notifyManagedInboxUpdated(lastResult.import_id);
    }
  }
  if (!lastResult) {
    throw new Error(
      'Clipboard file format is not supported. Supported formats: PDF, EPUB, Markdown, HTML, text, png, jpg, jpeg, webp, and gif.'
    );
  }
  return lastResult;
}

function updateImportedNodeContent(nodeId: string, content: string, nodeTitle: string, importedAt: string) {
  const connection = openDatabaseConnection();
  const bodyBlobHash = upsertTextBodyBlob(connection.driver, content, importedAt);
  connection.driver.transaction(() => {
    connection.driver.execute('UPDATE nodes SET content = ?, body_blob_hash = ?, opening_text = ?, updated_at = ? WHERE id = ?', [
      content,
      bodyBlobHash,
      resolveNodeOpeningText(content, nodeTitle),
      importedAt,
      nodeId
    ]);
    enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, [nodeId]);
  });
}

async function runClipboardImageImport(args?: NativeTextImportArgs) {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }

  const bytes = image.toPNG();
  const mimeType = 'image/png';
  const hash = createContentHash(bytes);
  const originalName = normalizeImageFileName('pasted-image.png', mimeType);
  const importedAt = new Date().toISOString();
  const content = `![Pasted image](${buildAssetMarkdownUrl(hash, originalName)})`;
  const result = toNativeTextImportResult(
    runPreparedImport(
      buildPreparedImportRecord(
        {
          filePath: `clipboard://image/${hash}`,
          kind: 'markdown',
          sourceName: originalName
        },
        {
          content,
          highlightPolicy: resolveImportHighlightPolicy(args),
          importedAt,
          sourceIdentity: hash,
          sourceLocator: `clipboard://image/${hash}`,
          sourceTrackingMode: 'untracked',
          ...importTargetParentNodeProps(args),
          titleStrategy: resolveImportNodeTitleStrategy(args)
        }
      )
    )
  );
  if (result.node_id) {
    const attachmentResult = await importImageAttachmentBytes({
      bytes,
      errorSource: '[clipboard-image]',
      mimeType,
      nodeId: result.node_id,
      originalName
    });
    if (attachmentResult.status !== 'imported') {
      updateImportedNodeContent(result.node_id, `[${attachmentResult.message}]`, 'Pasted image', importedAt);
    }
  }
  notifyManagedInboxUpdated(result.import_id);
  return result;
}

function createClipboardTextPreparedRecord(input: {
  args?: NativeTextImportArgs;
  content: string;
  importedAt: string;
  kind: 'html' | 'text';
}) {
  const payload = toImportPayload(input.content, input.kind, 'Clipboard import');
  const sourceName = resolveClipboardTextSourceName(payload.content);
  const record = buildPreparedImportRecord(
    {
      filePath: `clipboard://${input.kind}/${input.importedAt}`,
      kind: input.kind,
      sourceName
    },
    {
      ...payload,
      highlightPolicy: resolveImportHighlightPolicy(input.args),
      importedAt: input.importedAt,
      sourceTrackingMode: 'untracked',
      ...importTargetParentNodeProps(input.args),
      titleStrategy: input.args?.title_strategy ? resolveImportNodeTitleStrategy(input.args) : 'heading'
    }
  );
  return { ...record, hideTitleHeading: false };
}

function readClipboardTextContent() {
  const html = clipboard.readHTML().trim();
  const text = clipboard.readText().trim();
  const source = decideClipboardPasteSource({ html, plainText: text });
  if (!source) {
    return null;
  }
  return {
    content: source.content,
    kind: source.kind === 'rich-html' ? 'html' as const : 'text' as const
  };
}

function runClipboardTextImport(args?: NativeTextImportArgs) {
  const textContent = readClipboardTextContent();
  if (!textContent) {
    return null;
  }
  const importedAt = new Date().toISOString();
  const result = toNativeTextImportResult(
    runPreparedImport(
      createClipboardTextPreparedRecord({
        ...(args === undefined ? {} : { args }),
        importedAt,
        ...textContent
      })
    )
  );
  notifyManagedInboxUpdated(result.import_id);
  return result;
}

export async function runClipboardImport(args?: NativeTextImportArgs) {
  const filePaths = await collectClipboardFilePaths();
  if (filePaths.length > 0) {
    const result = await runClipboardFileImport(filePaths, args);
    if (result) {
      return result;
    }
  }
  const imageResult = await runClipboardImageImport(args);
  if (imageResult) {
    return imageResult;
  }
  return runClipboardTextImport(args);
}
