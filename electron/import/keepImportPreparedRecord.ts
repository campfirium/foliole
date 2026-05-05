import { loadPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { loadPreparedReadwiseImportRecord } from './readwisePreparedImport.js';

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
