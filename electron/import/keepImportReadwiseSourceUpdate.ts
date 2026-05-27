import { readKeepImportItem, readKeepImportNodeContent } from '../database/keepImportItems.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadPreparedKeepImportRecord, resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { hasPrimarySourceChanged } from './keepImportSourceSignature.js';

function normalizeComparableContent(content: string) {
  return content.replace(/\r\n?/g, '\n').trim();
}

export async function shouldDeferReadwiseToSourceUpdate(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor
) {
  if (config.sourceType !== 'readwise') {
    return true;
  }
  const existingItem = readKeepImportItem(config.ruleId, source.sourceName);
  const sourceSignature = await resolveKeepImportSourceSignature(config, source);
  if (!hasPrimarySourceChanged(existingItem, sourceSignature)) {
    return false;
  }
  if (existingItem && existingItem.source_size_bytes === sourceSignature.primary.sizeBytes) {
    return false;
  }
  if (!existingItem?.last_node_id) {
    return true;
  }
  const existingContent = readKeepImportNodeContent(existingItem.last_node_id);
  if (existingContent === null) {
    return true;
  }
  const prepared = await loadPreparedKeepImportRecord(config, source, new Date().toISOString());
  return normalizeComparableContent(existingContent) !== normalizeComparableContent(prepared.content);
}
