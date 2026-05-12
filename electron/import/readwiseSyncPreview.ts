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
  if (existingItem.last_status === 'discovered' && !existingItem.last_node_id) {
    return 'new' as const;
  }
  const nodeState = existingItem.last_node_id
    ? readKeepImportNodeState(existingItem.last_node_id)
    : null;
  if (existingItem.last_node_id && (!nodeState || nodeState.deleted_at !== null)) {
    return 'blocked_deleted' as const;
  }
  return primaryChanged || highlightChanged ? 'updated' : 'unchanged';
}

function resolveBlockedLocation(ruleId: string, source: DirectoryImportSourceDescriptor) {
  const existingItem = readKeepImportItem(ruleId, source.sourceName);
  const nodeState = existingItem?.last_node_id
    ? readKeepImportNodeState(existingItem.last_node_id)
    : null;
  return nodeState?.deleted_at ? 'trash' : 'removed';
}

function resolveLocationCounts(entries: ReadwiseSyncPreviewEntry[]) {
  const activeCount = entries.filter((entry) => entry.status === 'unchanged').length;
  const blockedEntries = entries.filter((entry) => entry.status === 'blocked_deleted');
  return {
    activeCount,
    blockedCount: blockedEntries.length,
    removedCount: blockedEntries.filter((entry) => entry.blocked_location !== 'trash').length,
    trashCount: blockedEntries.filter((entry) => entry.blocked_location === 'trash').length,
  };
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
    blocked_location: status === 'blocked_deleted' ? resolveBlockedLocation(readwiseSource.id, source) : undefined,
    destination: decision.destination,
    detail:
      decision.destination === 'off'
        ? 'Skipped by current import behavior.'
        : status === 'blocked_deleted'
          ? 'This source was deleted in Foliole and will stay blocked until you import it again manually.'
          : null,
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
  const entries = (
    await Promise.all(
      settings.readwiseSources
        .filter(isReadwiseImportSource)
        .map((source) => previewReadwiseSource(source, settings))
    )
  ).flat();
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
