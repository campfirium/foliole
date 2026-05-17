import type { Dispatch, SetStateAction } from 'react';

import type { ImportManagerSettings, KeepImportPreviewSummary } from '../../../lib/core/import/importManagerSettings';
import {
  isGenericSplitImportSourceUnsupported
} from '../../../lib/core/import/unsupportedKeepImportRules';
import { previewRuntimeKeepImportRule } from '../../shared/platform/keepImportPreviewRuntimeRepository';

import { replaceSource } from './importSourceGenericActions';

type SetSettings = Dispatch<SetStateAction<ImportManagerSettings>>;

function toKeepPreviewSummary(
  result: NonNullable<Awaited<ReturnType<typeof previewRuntimeKeepImportRule>>>
) {
  return {
    blockedCount: result.blockedCount,
    discoveredCount: result.discoveredCount,
    failedCount: result.failedCount,
    newCount: result.newCount,
    previewedAt: result.previewedAt,
    samples: result.entries.slice(0, 6).map((entry) => ({
      contentPreview: entry.contentPreview,
      detail: entry.detail,
      detectedHighlightCount: entry.detectedHighlightCount,
      highlightSamples: entry.highlightSamples,
      sourcePath: entry.sourcePath,
      status: entry.status
    })),
    unchangedCount: result.unchangedCount,
    updatedCount: result.updatedCount
  } satisfies KeepImportPreviewSummary;
}

export function createKeepImportActions(settings: ImportManagerSettings, setSettings: SetSettings) {
  return {
    handleConfirmKeepImport(sourceId: string, scope: 'readwiseSources' | 'sources') {
      setSettings((current) => ({
        ...current,
        [scope]: replaceSource(current[scope], sourceId, (source) =>
          source.keepPreview && !isGenericSplitImportSourceUnsupported(source)
            ? { ...source, keepState: 'enabled' }
            : source
        )
      }));
    },
    handleDisableKeepImport(sourceId: string, scope: 'readwiseSources' | 'sources') {
      setSettings((current) => ({
        ...current,
        [scope]: replaceSource(current[scope], sourceId, (source) => ({
          ...source,
          keepState: source.keepPreview ? 'previewed' : 'draft'
        }))
      }));
    },
    async handlePreviewKeepImport(sourceId: string, scope: 'readwiseSources' | 'sources') {
      const source = settings[scope].find((entry) => entry.id === sourceId);
      if (!source?.primaryPath.trim() || isGenericSplitImportSourceUnsupported(source)) {
        return null;
      }
      const result = await previewRuntimeKeepImportRule({
        directoryPath: source.primaryPath,
        highlightMode: source.highlightMode,
        highlightPolicy:
          scope === 'sources' && source.highlightMode === 'merged' ? 'adopt' : 'reference_only',
        ruleId: source.id,
        sourceType: scope === 'readwiseSources' ? 'readwise' : 'generic'
      });
      if (!result) {
        return null;
      }
      const preview = toKeepPreviewSummary(result);
      setSettings((current) => ({
        ...current,
        [scope]: replaceSource(current[scope], sourceId, (entry) => ({
          ...entry,
          keepPreview: preview,
          keepState: 'previewed'
        }))
      }));
      return preview;
    }
  };
}
