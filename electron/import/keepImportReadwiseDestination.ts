import fs from 'node:fs/promises';

import { needsReadwiseFrontmatterRefresh } from '../../lib/core/database/importReadwiseHighlightUpdates.js';
import type { ImportManagerSourceDraft, ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import { extractReadwiseFullDocumentFrontmatter } from '../../lib/core/import/readwiseFullDocumentParsing.js';
import {
  resolveReadwiseImportDestination,
  type ReadwiseReaderConfig
} from '../../lib/core/import/readwiseReaderSettings.js';
import { readKeepImportItem, readKeepImportNodeContent, readKeepImportNodeState, upsertKeepImportItem } from '../database/keepImportItems.js';
import { hasReadwiseExternalDocument } from '../database/readwiseManagedExternalDocuments.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { upsertReadwiseExternalDocument } from './readwiseExternalDocuments.js';
import {
  readwiseKeepAdapter
} from './readwiseKeepAdapter.js';

type ResolvedReadwiseSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };

function resolveReadwiseSource(config: KeepImportRuleConfig) {
  if (config.sourceType !== 'readwise') {
    return null;
  }
  const settings = loadImportManagerSettings();
  const readwiseSource = settings.readwiseSources.find((entry) => entry.id === config.ruleId);
  if (!readwiseSource?.highlightPath.trim() || !readwiseSource.primaryPath.trim() || !readwiseSource.kind) {
    return null;
  }
  return {
    readwiseConfig: settings.readwiseReaderConfig,
    readwiseSource: readwiseSource as ResolvedReadwiseSource
  } satisfies { readwiseConfig: ReadwiseReaderConfig; readwiseSource: ResolvedReadwiseSource };
}

export async function resolveReadwiseKeepImportDestination(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  const resolved = resolveReadwiseSource(config);
  if (!resolved) {
    return 'inbox';
  }
  if (resolved.readwiseSource.kind === 'books') {
    return 'off';
  }
  const sourceSignature = await readwiseKeepAdapter.resolveSourceSignature(source, {
    highlightDirectoryPath: resolved.readwiseSource.highlightPath.trim()
  });
  return resolveReadwiseImportDestination(resolved.readwiseConfig, sourceSignature.highlight !== null);
}

export async function shouldRunUnchangedReadwiseDestination(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor
) {
  const resolved = resolveReadwiseSource(config);
  if (!resolved) {
    return false;
  }
  const sourceSignature = await readwiseKeepAdapter.resolveSourceSignature(source, {
    highlightDirectoryPath: resolved.readwiseSource.highlightPath.trim()
  });
  const destination = resolveReadwiseImportDestination(resolved.readwiseConfig, sourceSignature.highlight !== null);
  if (destination === 'off') {
    return false;
  }
  if (destination === 'external') {
    return !hasReadwiseExternalDocument(resolved.readwiseSource.kind, source.sourceName);
  }
  const existingItem = readKeepImportItem(config.ruleId, source.sourceName);
  if (!existingItem?.last_node_id || !readKeepImportNodeState(existingItem.last_node_id)) {
    return true;
  }
  const existingContent = readKeepImportNodeContent(existingItem.last_node_id);
  if (!existingContent) {
    return true;
  }
  if (existingContent.trimStart().startsWith('---')) {
    return false;
  }
  const fullDocumentMarkdown = await fs.readFile(source.filePath, 'utf8');
  const frontmatter = extractReadwiseFullDocumentFrontmatter(fullDocumentMarkdown);
  return needsReadwiseFrontmatterRefresh(existingContent, frontmatter);
}

export async function runReadwiseExternalDocumentImport(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  const resolved = resolveReadwiseSource(config);
  if (!resolved) {
    return { detail: 'Readwise source is not configured.', failureReason: 'Readwise source is not configured.', importStatus: 'failed' as const };
  }
  const importedAt = new Date().toISOString();
  const sourceSignature = await readwiseKeepAdapter.resolveSourceSignature(source, {
    highlightDirectoryPath: resolved.readwiseSource.highlightPath.trim()
  });
  try {
    const prepared = await readwiseKeepAdapter.loadPreparedRecord(source, {
      highlightDirectoryPath: resolved.readwiseSource.highlightPath.trim(),
      highlightPolicy: config.highlightPolicy,
      importedAt,
      kind: resolved.readwiseSource.kind,
      readwiseConfig: resolved.readwiseConfig
    });
    const result = upsertReadwiseExternalDocument({
      content: prepared.content,
      indexedAt: importedAt,
      kind: resolved.readwiseSource.kind,
      primaryPath: resolved.readwiseSource.primaryPath.trim(),
      source
    });
    persistReadwiseExternalTracking(config, source, sourceSignature, importedAt, 'imported');
    return { detail: result.documentId, failureReason: null, importStatus: 'imported' as const };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown Readwise external import failure';
    persistReadwiseExternalTracking(config, source, sourceSignature, importedAt, 'failed');
    return { detail: failureReason, failureReason, importStatus: 'failed' as const };
  }
}

function persistReadwiseExternalTracking(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  sourceSignature: Awaited<ReturnType<typeof readwiseKeepAdapter.resolveSourceSignature>>,
  importedAt: string,
  status: 'failed' | 'imported'
) {
  upsertKeepImportItem({
    hasSourceUpdate: false,
    highlightSourceMtimeMs: sourceSignature.highlight?.mtimeMs ?? null,
    highlightSourceSizeBytes: sourceSignature.highlight?.sizeBytes ?? null,
    lastImportedAt: status === 'imported' ? importedAt : null,
    lastNodeId: null,
    lastSeenAt: importedAt,
    lastStatus: status,
    localNodeState: 'not_imported',
    ruleId: config.ruleId,
    sourceMtimeMs: sourceSignature.primary.mtimeMs,
    sourcePath: source.sourceName,
    sourceSizeBytes: sourceSignature.primary.sizeBytes
  });
}
