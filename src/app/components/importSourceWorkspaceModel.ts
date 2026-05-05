import {
  applyReadwiseRootPath,
  createDefaultGenericImportSources,
  createDraftImportSource,
  createNextImportSourceIndex,
  createReadwiseImportSources,
  formatReadwiseSourceLabel,
  importActionOptions,
  importFrequencyOptions,
  type ImportHighlightMode,
  type ImportManagerSourceDraft as DraftImportSource,
  type ImportTriggerMode
} from '../../../lib/core/import/importManagerSettings';

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

export function formatTriggerModeLabel(mode: ImportTriggerMode) {
  return mode === 'scheduled' ? 'Scheduled' : 'Manual';
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
      highlightPath: highlightMode === 'split' ? source.highlightPath : ''
    };
  }

  if (field === 'triggerMode') {
    return {
      ...source,
      triggerMode: value === 'scheduled' ? 'scheduled' : 'manual'
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
    [field]: value
  };
}

export {
  applyReadwiseRootPath,
  createDefaultGenericImportSources,
  createDraftImportSource,
  createNextImportSourceIndex,
  createReadwiseImportSources,
  formatReadwiseSourceLabel,
  importActionOptions,
  importFrequencyOptions
};
