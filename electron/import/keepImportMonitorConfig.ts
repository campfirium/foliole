import type { ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import type { ImportManagerSettings, ImportManagerSourceDraft } from '../../lib/core/import/importManagerSettings.js';

export interface KeepImportConfig {
  adapterConfigId: string;
  directoryPath: string;
  highlightPolicy: ImportHighlightPolicy;
  sourceType: 'generic' | 'readwise';
}

export interface KeepImportSourceConfig extends KeepImportConfig {
  sourceId: string;
}

function normalizeKeepDirectoryPath(path: string) {
  return path.trim();
}

function toKeepImportConfig(
  source: ImportManagerSourceDraft,
  highlightPolicy: ImportHighlightPolicy,
  sourceType: 'generic' | 'readwise'
): KeepImportSourceConfig | null {
  const directoryPath = normalizeKeepDirectoryPath(source.primaryPath);
  if (source.keepState !== 'enabled' || !directoryPath) {
    return null;
  }
  return {
    adapterConfigId: source.id,
    directoryPath,
    highlightPolicy,
    sourceId: source.id,
    sourceType
  };
}

export function resolveKeepImportConfigs(settings: ImportManagerSettings): KeepImportSourceConfig[] {
  return [
    ...settings.sources
      .map((source) => toKeepImportConfig(source, 'reference_only', 'generic'))
      .filter((config): config is KeepImportSourceConfig => config !== null),
    ...settings.readwiseSources
      .map((source) => toKeepImportConfig(source, 'reference_only', 'readwise'))
      .filter((config): config is KeepImportSourceConfig => config !== null)
  ];
}
