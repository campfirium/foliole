import type { ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import {
  type ImportManagerSettings,
  type ImportManagerSourceDraft
} from '../../lib/core/import/importManagerSettings.js';
import { isGenericSplitImportSourceUnsupported } from '../../lib/core/import/unsupportedKeepImportRules.js';

export interface KeepImportConfig {
  actionMode: ImportManagerSourceDraft['actionMode'];
  adapterConfigId: string;
  directoryPath: string;
  highlightDirectoryPath?: string;
  highlightMode: ImportManagerSourceDraft['highlightMode'];
  highlightPolicy: ImportHighlightPolicy;
  sourceType: 'generic' | 'readwise';
  watchPaths: string[];
}

export interface KeepImportSourceConfig extends KeepImportConfig {
  sourceId: string;
}

function normalizeKeepDirectoryPath(path: string) {
  return path.trim();
}

function resolveSourceHighlightPolicy(source: ImportManagerSourceDraft, sourceType: 'generic' | 'readwise'): ImportHighlightPolicy {
  if (sourceType === 'generic' && source.highlightMode === 'merged') {
    return 'adopt';
  }
  return 'reference_only';
}

function toKeepImportConfig(
  source: ImportManagerSourceDraft,
  sourceType: 'generic' | 'readwise'
): KeepImportSourceConfig | null {
  const directoryPath = normalizeKeepDirectoryPath(source.primaryPath);
  const highlightPath = normalizeKeepDirectoryPath(source.highlightPath);
  if (source.keepState !== 'enabled' || !directoryPath || isGenericSplitImportSourceUnsupported(source)) {
    return null;
  }
  if (source.highlightMode === 'split' && !highlightPath) {
    return null;
  }
  const watchPaths = [directoryPath];
  if (source.highlightMode === 'split' && highlightPath && highlightPath !== directoryPath) {
    watchPaths.push(highlightPath);
  }
  return {
    actionMode: source.actionMode,
    adapterConfigId: source.id,
    directoryPath,
    ...(highlightPath ? { highlightDirectoryPath: highlightPath } : {}),
    highlightMode: source.highlightMode,
    highlightPolicy: resolveSourceHighlightPolicy(source, sourceType),
    sourceId: source.id,
    sourceType,
    watchPaths
  };
}

export function resolveKeepImportConfigs(settings: ImportManagerSettings): KeepImportSourceConfig[] {
  return [
    ...settings.sources
      .map((source) => toKeepImportConfig(source, 'generic'))
      .filter((config): config is KeepImportSourceConfig => config !== null),
    ...settings.readwiseSources
      .map((source) => toKeepImportConfig(source, 'readwise'))
      .filter((config): config is KeepImportSourceConfig => config !== null)
  ];
}
