import {
  applyReadwiseRootPath,
  createDefaultGenericImportSources,
  createDraftImportSource,
  createNextImportSourceIndex,
  createReadwiseImportSources,
  formatReadwiseSourceLabel,
  type ImportHighlightMode,
  type ImportManagerSourceDraft as DraftImportSource
} from '../../../lib/core/import/importManagerSettings';
import { importActionOptions } from '../../../lib/core/import/importSourceActions';

export type DraftImportSourceField = keyof DraftImportSource;
export type { DraftImportSource };

export const importSourceSelectClassName =
  'h-10 w-full rounded-md border border-border bg-bg-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong';

export function cloneDraftImportSource(source: DraftImportSource, index: number): DraftImportSource {
  return {
    ...source,
    id: createDraftImportSource(index).id
  };
}

export function formatHighlightModeLabel(mode: ImportHighlightMode) {
  return mode === 'split' ? 'Split' : 'Merged';
}

export function formatSourceActionLabel(mode: DraftImportSource['actionMode']) {
  const matchedOption = importActionOptions.find((option) => option.value === mode);
  return matchedOption?.label ?? 'Keep';
}

export function formatKeepStateLabel(state: DraftImportSource['keepState']) {
  if (state === 'enabled') {
    return 'Enabled';
  }
  if (state === 'previewed') {
    return 'Ready to enable';
  }
  return 'Needs preview';
}

export function updateDraftImportSource(
  source: DraftImportSource,
  field: DraftImportSourceField,
  value: string
): DraftImportSource {
  if (field === 'highlightMode') {
    const highlightMode = value === 'split' ? 'split' : 'merged';
    return {
      ...source,
      highlightMode,
      highlightPath: highlightMode === 'split' ? source.highlightPath : '',
      keepPreview: null,
      keepState: 'draft'
    };
  }

  if (field === 'actionMode') {
    const actionMode = value === 'move' || value === 'delete' ? value : 'keep';
    return {
      ...source,
      actionMode,
      archivePath: actionMode === 'move' ? source.archivePath : ''
    };
  }

  return {
    ...source,
    keepPreview:
      field === 'primaryPath' || field === 'highlightPath'
        ? null
        : source.keepPreview,
    keepState:
      field === 'primaryPath' || field === 'highlightPath'
        ? 'draft'
        : source.keepState,
    [field]: value
  };
}

export {
  applyReadwiseRootPath,
  createDefaultGenericImportSources,
  createDraftImportSource,
  createNextImportSourceIndex,
  createReadwiseImportSources,
  formatReadwiseSourceLabel
};
