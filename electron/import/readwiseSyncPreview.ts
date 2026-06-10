import path from 'node:path';

import {
  normalizeImportManagerSettings,
  type ImportManagerSettings,
  type ImportManagerSourceDraft,
  type ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import type {
  NativeReadwiseSyncPreviewEntry,
  NativeReadwiseSyncPreviewResult,
} from '../../lib/platform/nativeImportContract.js';
import { readKeepImportItem, readKeepImportNodeState } from '../database/keepImportItems.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { hasHighlightSourceChanged, hasPrimarySourceChanged } from './keepImportSourceSignature.js';
import {
  resolveReadwiseSourceImportDecision,
  resolveReadwiseSourceSignature
} from './readwisePreparedImport.js';
import { discoverReadwiseImportSources } from './readwiseSourceDiscovery.js';
import {
  resolveReadwisePreviewHighlightStatus,
  sortReadwisePreviewEntries
} from './readwiseSyncPreviewEntryState.js';

type ReadwiseSyncPreviewEntry = NativeReadwiseSyncPreviewEntry;
export type ReadwiseSyncPreviewResult = NativeReadwiseSyncPreviewResult;

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
  if (existingItem.last_status === 'discovered' && !existingItem.last_node_id) {
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

function resolveLocationCounts(entries: ReadwiseSyncPreviewEntry[]) {
  const activeCount = entries.filter((entry) => entry.status === 'unchanged').length;
  return {
    activeCount,
    blockedCount: 0,
    removedCount: 0,
    trashCount: 0,
  };
}

function resolvePreviewStatus(input: {
  decision: Awaited<ReturnType<typeof resolveReadwiseSourceImportDecision>>;
  existingItem: ReturnType<typeof readKeepImportItem>;
  readwiseSource: ReadwiseImportSource;
  source: DirectoryImportSourceDescriptor;
  sourceSignature: Awaited<ReturnType<typeof resolveReadwiseSourceSignature>>;
}) {
  if (input.decision.destination === 'off') {
    return 'off' as const;
  }
  return resolveTrackingStatus(
    input.readwiseSource.id,
    input.source,
    hasHighlightSourceChanged(input.existingItem, input.sourceSignature),
    hasPrimarySourceChanged(input.existingItem, input.sourceSignature)
  );
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
  const status = resolvePreviewStatus({ decision, existingItem, readwiseSource, source, sourceSignature });
  const hasHighlightFile = sourceSignature.highlight !== null;
  const primaryPath = path.join(readwiseSource.primaryPath, source.sourceName);
  const hasPrimaryFile = source.filePath === primaryPath;
  const highlightStatus = resolveReadwisePreviewHighlightStatus({ decision, hasPrimaryFile });
  return {
    destination: decision.destination,
    detail:
      highlightStatus === 'unparsed'
        ? 'Highlight file was found, but no highlights matched the current parser settings.'
        : highlightStatus === 'highlight_only'
          ? 'Highlight file was found without a matching full document source file.'
        : decision.destination === 'off'
        ? 'Skipped by current import behavior.'
        : null,
    detected_highlight_count: decision.detectedHighlightCount,
    highlight_status: highlightStatus,
    highlight_type: hasHighlightFile ? 'with_highlights' : 'without_highlights',
    open_path: hasHighlightFile ? path.join(readwiseSource.highlightPath, source.sourceName) : source.filePath,
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
    const sources = await discoverReadwiseImportSources({
      highlightDirectoryPath: readwiseSource.highlightPath,
      primaryDirectoryPath: readwiseSource.primaryPath
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
  if (!settings.readwiseReaderConfig.enabled) {
    return {
      active_count: 0,
      blocked_count: 0,
      entries: [],
      external_count: 0,
      failed_count: 0,
      inbox_count: 0,
      off_count: 0,
      previewed_at: new Date().toISOString(),
      readwise_root_path: settings.readwiseRootPath,
      trash_count: 0,
      total_count: 0,
      removed_count: 0,
      with_highlights_count: 0,
      without_highlights_count: 0,
      write_count: 0
    };
  }
  const entries = sortReadwisePreviewEntries((
    await Promise.all(
      settings.readwiseSources
        .filter(isReadwiseImportSource)
        .map((source) => previewReadwiseSource(source, settings))
    )
  ).flat());
  const locationCounts = resolveLocationCounts(entries);
  return {
    active_count: locationCounts.activeCount,
    blocked_count: locationCounts.blockedCount,
    entries,
    external_count: entries.filter((entry) => entry.destination === 'external').length,
    failed_count: entries.filter((entry) => entry.status === 'failed').length,
    inbox_count: entries.filter((entry) => entry.destination === 'inbox').length,
    off_count: entries.filter((entry) => entry.destination === 'off').length,
    previewed_at: new Date().toISOString(),
    readwise_root_path: settings.readwiseRootPath,
    trash_count: locationCounts.trashCount,
    total_count: entries.length,
    removed_count: locationCounts.removedCount,
    with_highlights_count: entries.filter((entry) => entry.highlight_type === 'with_highlights')
      .length,
    without_highlights_count: entries.filter(
      (entry) => entry.highlight_type === 'without_highlights'
    ).length,
    write_count: entries.filter((entry) => entry.destination !== 'off' && (entry.status === 'new' || entry.status === 'updated'))
      .length
  };
}
