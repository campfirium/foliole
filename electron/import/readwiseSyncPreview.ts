import {
  normalizeImportManagerSettings,
  type ImportManagerSettings,
  type ImportManagerSourceDraft,
  type ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import type {
  NativeReadwiseSyncPreviewDestination,
  NativeReadwiseSyncPreviewEntry,
  NativeReadwiseSyncPreviewHighlightType,
  NativeReadwiseSyncPreviewResult,
  NativeReadwiseSyncPreviewStatus
} from '../../lib/platform/nativeImportContract.js';
import { readKeepImportItem, readKeepImportNodeState } from '../database/keepImportItems.js';
import {
  discoverDirectoryImportSources,
  type DirectoryImportSourceDescriptor
} from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { hasHighlightSourceChanged, hasPrimarySourceChanged } from './keepImportSourceSignature.js';
import {
  resolveReadwiseSourceImportDecision,
  resolveReadwiseSourceSignature
} from './readwisePreparedImport.js';

export type ReadwiseSyncPreviewDestination = NativeReadwiseSyncPreviewDestination;
export type ReadwiseSyncPreviewEntry = NativeReadwiseSyncPreviewEntry;
export type ReadwiseSyncPreviewHighlightType = NativeReadwiseSyncPreviewHighlightType;
export type ReadwiseSyncPreviewResult = NativeReadwiseSyncPreviewResult;
export type ReadwiseSyncPreviewStatus = NativeReadwiseSyncPreviewStatus;

type ReadwiseImportSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };

function isReadwiseImportSource(source: ImportManagerSourceDraft): source is ReadwiseImportSource {
  return (
    Boolean(source.kind) &&
    source.primaryPath.trim().length > 0 &&
    source.highlightPath.trim().length > 0
  );
}

function resolveTrackingStatus(
  ruleId: string,
  source: DirectoryImportSourceDescriptor,
  highlightChanged: boolean,
  primaryChanged: boolean
) {
  const existingItem = readKeepImportItem(ruleId, source.sourceName);
  if (!existingItem) {
    return 'new' as const;
  }
  const nodeState = existingItem.last_node_id
    ? readKeepImportNodeState(existingItem.last_node_id)
    : null;
  if (existingItem.last_node_id && (!nodeState || nodeState.deleted_at !== null)) {
    return 'new' as const;
  }
  return primaryChanged || highlightChanged ? 'updated' : 'unchanged';
}

async function buildSourceEntry(
  source: DirectoryImportSourceDescriptor,
  readwiseSource: ReadwiseImportSource,
  settings: ImportManagerSettings
): Promise<ReadwiseSyncPreviewEntry> {
  const decision = await resolveReadwiseSourceImportDecision(source, {
    highlightDirectoryPath: readwiseSource.highlightPath,
    readwiseConfig: settings.readwiseReaderConfig
  });
  const sourceSignature = await resolveReadwiseSourceSignature(source, {
    highlightDirectoryPath: readwiseSource.highlightPath
  });
  const existingItem = readKeepImportItem(readwiseSource.id, source.sourceName);
  const status =
    decision.destination === 'off'
      ? 'off'
      : resolveTrackingStatus(
          readwiseSource.id,
          source,
          hasHighlightSourceChanged(existingItem, sourceSignature),
          hasPrimarySourceChanged(existingItem, sourceSignature)
        );
  return {
    destination: decision.destination,
    detail: decision.destination === 'off' ? 'Skipped by current import behavior.' : null,
    detected_highlight_count: decision.detectedHighlightCount,
    highlight_type: decision.hasHighlights ? 'with_highlights' : 'without_highlights',
    source_kind: readwiseSource.kind,
    source_path: source.sourceName,
    status
  };
}

async function previewReadwiseSource(
  readwiseSource: ReadwiseImportSource,
  settings: ImportManagerSettings
) {
  try {
    const sources = await discoverDirectoryImportSources(readwiseSource.primaryPath, {
      supportedKinds: ['markdown']
    });
    return Promise.all(sources.map((source) => buildSourceEntry(source, readwiseSource, settings)));
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    return [
      {
        destination: 'off' as const,
        detail: error instanceof Error ? error.message : 'Unable to scan Readwise source folder.',
        detected_highlight_count: 0,
        highlight_type: 'without_highlights' as const,
        source_kind: readwiseSource.kind,
        source_path: readwiseSource.primaryPath,
        status: 'failed' as const
      }
    ];
  }
}

export async function previewReadwiseReaderImport(
  settingsInput?: unknown
): Promise<ReadwiseSyncPreviewResult> {
  const settings = settingsInput
    ? normalizeImportManagerSettings(settingsInput)
    : loadImportManagerSettings();
  const entries = (
    await Promise.all(
      settings.readwiseSources
        .filter(isReadwiseImportSource)
        .map((source) => previewReadwiseSource(source, settings))
    )
  ).flat();
  return {
    entries,
    external_count: entries.filter((entry) => entry.destination === 'external').length,
    failed_count: entries.filter((entry) => entry.status === 'failed').length,
    inbox_count: entries.filter((entry) => entry.destination === 'inbox').length,
    off_count: entries.filter((entry) => entry.destination === 'off').length,
    previewed_at: new Date().toISOString(),
    readwise_root_path: settings.readwiseRootPath,
    total_count: entries.length,
    with_highlights_count: entries.filter((entry) => entry.highlight_type === 'with_highlights')
      .length,
    without_highlights_count: entries.filter(
      (entry) => entry.highlight_type === 'without_highlights'
    ).length,
    write_count: entries.filter((entry) => entry.destination !== 'off' && entry.status !== 'failed')
      .length
  };
}
