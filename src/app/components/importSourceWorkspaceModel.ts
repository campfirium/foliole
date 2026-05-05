export type ImportHighlightMode = 'merged' | 'split';
export type ImportSourceAction = 'delete' | 'keep' | 'move';
export type ImportTriggerMode = 'manual' | 'scheduled';

export interface DraftImportSource {
  actionMode: ImportSourceAction;
  archivePath: string;
  frequency: string;
  highlightMode: ImportHighlightMode;
  highlightPath: string;
  id: string;
  primaryPath: string;
  triggerMode: ImportTriggerMode;
}

export type DraftImportSourceField = keyof DraftImportSource;

export const importSourceSelectClassName =
  'h-10 w-full rounded-md border border-border bg-bg-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong';

export const importFrequencyOptions = ['5 min', '15 min', '30 min', '1 hour', '4 hours', '24 hours'];
export const importActionOptions = [
  { label: 'Keep', value: 'keep' },
  { label: 'Delete', value: 'delete' },
  { label: 'Move', value: 'move' }
] as const;

function createImportSourceId(index: number) {
  return `draft-import-source-${index}`;
}

export function createDraftImportSource(index: number): DraftImportSource {
  return {
    actionMode: 'keep',
    archivePath: '',
    frequency: importFrequencyOptions[0],
    highlightMode: 'merged',
    highlightPath: '',
    id: createImportSourceId(index),
    primaryPath: '',
    triggerMode: 'scheduled'
  };
}

export function cloneDraftImportSource(source: DraftImportSource, index: number): DraftImportSource {
  return {
    ...source,
    id: createImportSourceId(index)
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
