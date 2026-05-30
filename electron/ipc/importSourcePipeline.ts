import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  ImportHighlightPolicy,
  ImportSourceKind
} from '../../lib/core/import/contract.js';
import { buildRetainedDegradedImportContent } from '../../lib/core/import/controlledContext.js';
import { convertHtmlToMarkdownCompatible, formatHtmlConversionDegradedReason } from '../../lib/core/import/htmlToMarkdownCompatible.js';
import { normalizeImportNodeTitleStrategy, type ImportNodeTitleStrategy } from '../../lib/core/import/importManagerSettings.js';
import type { NativeTextImportArgs } from '../../lib/platform/nativeContract.js';

import { buildPreparedImportRecord, type LoadPreparedImportOptions } from './importPreparedRecord.js';
export {
  discoverDirectoryImportSources,
  MANAGED_INBOX_SUPPORTED_KINDS,
  resolveImportKind,
  type DirectoryImportAdapterId,
  type DirectoryImportSourceDescriptor,
  type ImportSourceDescriptor
} from './importSourceDiscovery.js';
import { resolveImportKind, type ImportSourceDescriptor } from './importSourceDiscovery.js';
export { buildPreparedImportRecord };

function stripUtf8Bom(content: string) {
  return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

export function resolveImportHighlightPolicy(args?: Pick<NativeTextImportArgs, 'highlight_policy'>): ImportHighlightPolicy {
  return args?.highlight_policy === 'adopt' ? 'adopt' : 'reference_only';
}

export function resolveImportNodeTitleStrategy(args?: Pick<NativeTextImportArgs, 'title_strategy'>): ImportNodeTitleStrategy {
  return normalizeImportNodeTitleStrategy(args?.title_strategy);
}

export function resolveImportTargetParentNodeId(args?: Pick<NativeTextImportArgs, 'target_parent_node_id'>) {
  const targetParentNodeId = args?.target_parent_node_id?.trim();
  return targetParentNodeId || undefined;
}

export function importTargetParentNodeProps(args?: Pick<NativeTextImportArgs, 'target_parent_node_id'>) {
  const targetParentNodeId = resolveImportTargetParentNodeId(args);
  return targetParentNodeId ? { targetParentNodeId } : {};
}

export function toImportPayload(content: string, kind: ImportSourceKind, sourceName = 'Imported source') {
  const normalizedContent = stripUtf8Bom(content);
  if (kind === 'epub') {
    const reason = 'EPUB import degraded: text extraction is not implemented yet';
    return {
      content: buildRetainedDegradedImportContent({ reason, sourceKind: kind, sourceName }),
      degradedReason: reason
    };
  }
  if (kind === 'pdf') {
    return {
      content: [`# ${path.parse(sourceName).name}`, '', 'Linked PDF source ready for the reader surface.'].join('\n'),
      degradedReason: null
    };
  }
  if (kind !== 'html') {
    return { content: normalizedContent, degradedReason: null };
  }
  const converted = convertHtmlToMarkdownCompatible(normalizedContent);
  return {
    content: converted.content,
    degradedReason: formatHtmlConversionDegradedReason(converted.warnings)
  };
}

export async function loadPreparedImportRecord(
  source: Pick<ImportSourceDescriptor, 'filePath' | 'kind' | 'sourceName'>,
  options: LoadPreparedImportOptions
) {
  const payload =
    source.kind === 'epub' || source.kind === 'pdf'
      ? toImportPayload('', source.kind, source.sourceName)
      : toImportPayload(await fs.readFile(source.filePath, 'utf8'), source.kind, source.sourceName);
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
