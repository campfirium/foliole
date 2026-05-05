import { loadPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { loadPreparedReadwiseImportRecord, shouldImportReadwiseSource } from './readwisePreparedImport.js';

export async function shouldKeepImportReadwiseSource(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  if (config.sourceType !== 'readwise') {
    return true;
  }
  const settings = loadImportManagerSettings();
  const readwiseSource = settings.readwiseSources.find((entry) => entry.id === config.ruleId);
  if (!readwiseSource?.highlightPath.trim()) {
    return false;
  }
  return shouldImportReadwiseSource(source, {
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
    if (readwiseSource?.highlightPath.trim()) {
      return loadPreparedReadwiseImportRecord(source, {
        highlightDirectoryPath: readwiseSource.highlightPath.trim(),
        highlightPolicy: config.highlightPolicy,
        importedAt,
        readwiseConfig: settings.readwiseReaderConfig
      });
    }
  }

  return loadPreparedImportRecord(source, {
    highlightPolicy: config.highlightPolicy,
    importedAt
  });
}
