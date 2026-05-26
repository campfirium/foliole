import { buildImportedHighlightPreviewFromMatches } from '../../lib/core/import/importedHighlightPreview.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type { NativeKeepImportPreviewResult } from '../../lib/platform/nativeKeepImportContract.js';
import { readKeepImportItem, readKeepImportNodeState } from '../database/keepImportItems.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadPreparedKeepImportRecord, resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { hasHighlightSourceChanged, hasPrimarySourceChanged } from './keepImportSourceSignature.js';

type KeepImportPreviewStatus = NativeKeepImportPreviewResult['entries'][number]['status'];

export interface KeepImportPreviewEntry {
  contentPreview: string | null;
  detectedHighlightCount: number;
  detail: string | null;
  highlightSamples: NativeKeepImportPreviewResult['entries'][number]['highlight_samples'];
  sourcePath: string;
  status: KeepImportPreviewStatus;
}

export function isBlockedByDeletedNode(ruleId: string, sourcePath: string) {
  const existingItem = readKeepImportItem(ruleId, sourcePath);
  if (!existingItem?.last_node_id) {
    return { deleted: false, existingItem };
  }
  const nodeState = readKeepImportNodeState(existingItem.last_node_id);
  return {
    deleted: !nodeState || nodeState.deleted_at !== null,
    existingItem
  };
}

export async function classifySource(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor
): Promise<KeepImportPreviewEntry> {
  const sourcePath = source.sourceName;
  const sourceSignature = await resolveKeepImportSourceSignature(config, source);
  const blockedState = isBlockedByDeletedNode(config.ruleId, sourcePath);
  const deleted = blockedState.deleted;
  const existingItem = blockedState.existingItem;
  const notImported = existingItem?.last_status === 'discovered' && !existingItem.last_node_id;
  const primaryChanged = hasPrimarySourceChanged(existingItem, sourceSignature);
  const highlightChanged = config.sourceType === 'readwise' ? hasHighlightSourceChanged(existingItem, sourceSignature) : false;
  if (existingItem && !notImported && !deleted && !primaryChanged && !highlightChanged) {
    return {
      contentPreview: null,
      detail: 'No file changes detected since the last keep scan.',
      detectedHighlightCount: 0,
      highlightSamples: [],
      sourcePath,
      status: 'unchanged'
    };
  }
  try {
    const prepared = await loadPreparedKeepImportRecord(config, source, new Date().toISOString());
    const highlightPreview = buildImportedHighlightPreviewFromMatches({
      content: prepared.content,
      ...(prepared.matchedHighlights === undefined ? {} : { matchedHighlights: prepared.matchedHighlights }),
      ...(prepared.unmatchedHighlights === undefined ? {} : { unmatchedHighlights: prepared.unmatchedHighlights }),
      sourceName: sourcePath
    });
    return {
      contentPreview: resolveNodeOpeningText(prepared.content, prepared.nodeTitle),
      detectedHighlightCount: highlightPreview.detectedHighlightCount,
      detail:
        deleted
          ? 'This source was deleted in Foliole and will stay blocked until you import it again manually.'
          : !existingItem || notImported
            ? 'New file will be imported when enabled.'
            : highlightChanged && !primaryChanged
              ? 'Highlight file changed and will refresh highlight updates.'
              : 'Content file changed and will be refreshed when enabled.',
      highlightSamples: highlightPreview.samples,
      sourcePath,
      status: deleted ? 'blocked_deleted' : !existingItem || notImported ? 'new' : 'updated'
    };
  } catch (error) {
    return {
      contentPreview: null,
      detectedHighlightCount: 0,
      detail: error instanceof Error ? error.message : 'Unable to read this file during preview.',
      highlightSamples: [],
      sourcePath,
      status: 'failed'
    };
  }
}
