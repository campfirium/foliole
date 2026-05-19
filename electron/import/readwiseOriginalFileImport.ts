import { runPreparedImport } from '../database/importPipeline.js';
import { runEpubImport } from '../ipc/epubImport.js';
import { buildPreparedImportRecord, resolveSingleFileImportSource, toImportPayload } from '../ipc/importSourcePipeline.js';

import { saveRecentReadwiseBookEpubDirectory } from './readwiseBookEpubPicker.js';
import type { ReadwiseOriginalFileTarget } from './readwiseOriginalFileTarget.js';
import { mergeReadwiseTopicHighlightsFromFile } from './readwiseTopicMerge.js';

function buildReadwiseOriginalFileSourceIdentity(nodeId: string) {
  return `readwise/original-file/${nodeId}`;
}

function isMissingHighlightFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export async function importSelectedReadwiseOriginalFileIntoNode(input: {
  filePath: string;
  nodeId: string;
  sourceIdentity: string;
  title: string;
}) {
  const source = resolveSingleFileImportSource(input.filePath);
  const importedAt = new Date().toISOString();
  if (source.kind === 'epub') {
    const imported = await runEpubImport(source, importedAt, {
      sourceIdentity: input.sourceIdentity,
      sourceTrackingMode: 'tracked',
      targetNodeId: input.nodeId
    });
    return { importedAt, nodeId: imported.nodeId ?? input.nodeId };
  }
  const payload = toImportPayload('', source.kind, source.sourceName);
  const prepared = buildPreparedImportRecord(source, {
    ...payload,
    importedAt,
    nodeTitleOverride: input.title,
    sourceIdentity: input.sourceIdentity,
    sourceTrackingMode: 'tracked'
  });
  runPreparedImport(prepared, { forceUpdateExistingNodeId: input.nodeId });
  return { importedAt, nodeId: input.nodeId };
}

export async function importSelectedReadwiseTopicFile(input: {
  filePath: string;
  target: Extract<ReadwiseOriginalFileTarget, { kind: 'topic' }>;
}) {
  saveRecentReadwiseBookEpubDirectory(input.filePath);
  await importSelectedReadwiseOriginalFileIntoNode({
    filePath: input.filePath,
    nodeId: input.target.nodeId,
    sourceIdentity: buildReadwiseOriginalFileSourceIdentity(input.target.nodeId),
    title: input.target.title
  });
  if (input.target.highlightMarkdownPath) {
    try {
      await mergeReadwiseTopicHighlightsFromFile(input.target.nodeId, input.target.highlightMarkdownPath);
    } catch (error) {
      if (!isMissingHighlightFileError(error)) {
        throw error;
      }
    }
  }
}
