import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  ImportHighlightPolicy,
  ImportSourceKind
} from '../../lib/core/import/contract.js';
import { buildRetainedDegradedImportContent } from '../../lib/core/import/controlledContext.js';
import { normalizeImportNodeTitleStrategy, type ImportNodeTitleStrategy } from '../../lib/core/import/importManagerSettings.js';
import { buildPdfReaderPlaceholder } from '../../lib/core/import/pdfReaderPlaceholder.js';
import { readTextFileImportPayload, toTextFileImportPayload } from '../../lib/core/import/textFilePayload.js';
import type { NativeTextImportArgs } from '../../lib/platform/nativeContract.js';

import { buildPreparedImportRecord, type LoadPreparedImportOptions } from './importPreparedRecord.js';
export {
  discoverDirectoryImportSources,
  MANAGED_INBOX_SUPPORTED_KINDS,
  resolveImportKind,
  type DirectoryImportSourceDescriptor,
  type ImportSourceDescriptor
} from './importSourceDiscovery.js';
import { resolveImportKind, type ImportSourceDescriptor } from './importSourceDiscovery.js';
export { buildPreparedImportRecord };

export function resolveImportHighlightPolicy(args?: Pick<NativeTextImportArgs, 'highlight_policy'>): ImportHighlightPolicy {
  return args?.highlight_policy === 'adopt' ? 'adopt' : 'reference_only';
}

export function resolveImportNodeTitleStrategy(args?: Pick<NativeTextImportArgs, 'title_strategy'>): ImportNodeTitleStrategy {
  return normalizeImportNodeTitleStrategy(args?.title_strategy);
}

function resolveImportTargetParentNodeId(args?: Pick<NativeTextImportArgs, 'target_parent_node_id'>) {
  const targetParentNodeId = args?.target_parent_node_id?.trim();
  return targetParentNodeId || undefined;
}

export function importTargetParentNodeProps(args?: Pick<NativeTextImportArgs, 'target_parent_node_id'>) {
  const targetParentNodeId = resolveImportTargetParentNodeId(args);
  return targetParentNodeId ? { targetParentNodeId } : {};
}

export function toImportPayload(content: string, kind: ImportSourceKind, sourceName = 'Imported source') {
  if (kind === 'epub') {
    const reason = 'EPUB import degraded: text extraction is not implemented yet';
    return {
      content: buildRetainedDegradedImportContent({ reason, sourceKind: kind, sourceName }),
      degradedReason: reason
    };
  }
  if (kind === 'pdf') {
    return {
      content: buildPdfReaderPlaceholder(sourceName),
      degradedReason: null
    };
  }
  return toTextFileImportPayload(content, kind);
}

export async function loadPreparedImportRecord(
  source: Pick<ImportSourceDescriptor, 'filePath' | 'kind' | 'sourceName'>,
  options: LoadPreparedImportOptions
) {
  const payload =
    source.kind === 'epub' || source.kind === 'pdf'
      ? toImportPayload('', source.kind, source.sourceName)
      : readTextFileImportPayload(await fs.readFile(source.filePath), source.kind);
  return buildPreparedImportRecord(source, {
    ...payload,
    ...options,
    ...(options.sourceProfile !== undefined || source.kind === 'epub'
      ? { sourceProfile: options.sourceProfile ?? 'epub' }
      : {})
  });
}

export function resolveSingleFileImportSource(filePath: string): ImportSourceDescriptor {
  return {
    adapterId: 'text_file',
    filePath,
    kind: resolveImportKind(filePath),
    sourceName: path.basename(filePath)
  };
}
