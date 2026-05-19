import { readKeepImportItem } from '../database/keepImportItems.js';
import { loadPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { hasHighlightSourceChanged, hasPrimarySourceChanged } from './keepImportSourceSignature.js';
import { readwiseKeepAdapter } from './readwiseKeepAdapter.js';

export async function shouldKeepImportReadwiseSource(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  if (config.sourceType !== 'readwise') {
    return true;
  }
  const settings = loadImportManagerSettings();
  const readwiseSource = settings.readwiseSources.find((entry) => entry.id === config.ruleId);
  if (!readwiseSource?.highlightPath.trim()) {
    return false;
  }
  if (readwiseSource.kind === 'books') {
    return false;
  }
  const sourceSignature = await readwiseKeepAdapter.resolveSourceSignature(source, {
    highlightDirectoryPath: readwiseSource.highlightPath.trim()
  });
  const existingItem = readKeepImportItem(config.ruleId, source.sourceName);
  if (
    existingItem &&
    !hasPrimarySourceChanged(existingItem, sourceSignature) &&
    !hasHighlightSourceChanged(existingItem, sourceSignature)
  ) {
    return !(existingItem.last_status === 'discovered' && !existingItem.last_node_id);
  }
  return readwiseKeepAdapter.shouldImportSource(source, {
    highlightDirectoryPath: readwiseSource.highlightPath.trim(),
    readwiseConfig: settings.readwiseReaderConfig
  });
}

export async function loadPreparedKeepImportRecord(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  importedAt: string
) {
  if (config.sourceType === 'readwise') {
    const settings = loadImportManagerSettings();
    const readwiseSource = settings.readwiseSources.find((entry) => entry.id === config.ruleId);
    if (readwiseSource?.highlightPath.trim() && readwiseSource.kind) {
      return readwiseKeepAdapter.loadPreparedRecord(source, {
        highlightDirectoryPath: readwiseSource.highlightPath.trim(),
        highlightPolicy: config.highlightPolicy,
        importedAt,
        kind: readwiseSource.kind,
        readwiseConfig: settings.readwiseReaderConfig
      });
    }
  }

  return loadPreparedImportRecord(source, {
    highlightPolicy: config.highlightPolicy,
    importedAt,
    sourceTrackingMode: 'tracked',
    titleStrategy: loadImportManagerSettings().titleStrategy
  });
}

export async function resolveKeepImportSourceSignature(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  if (config.sourceType === 'readwise') {
    const settings = loadImportManagerSettings();
    const readwiseSource = settings.readwiseSources.find((entry) => entry.id === config.ruleId);
    if (readwiseSource?.highlightPath.trim()) {
      return readwiseKeepAdapter.resolveSourceSignature(source, {
        highlightDirectoryPath: readwiseSource.highlightPath.trim()
      });
    }
  }

  return {
    highlight: null,
    primary: {
      mtimeMs: source.mtimeMs,
      sizeBytes: source.sizeBytes
    }
  };
}
