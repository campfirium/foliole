export type ImportHighlightMode = 'merged' | 'split';
export type ImportSourceAction = 'delete' | 'keep' | 'move';
export type ImportTriggerMode = 'manual' | 'scheduled';
export type ReadwiseSourceKind = 'books' | 'articles' | 'tweets' | 'podcasts';

const READWISE_SOURCE_KINDS: ReadwiseSourceKind[] = ['articles', 'books', 'tweets', 'podcasts'];
const READWISE_FOLDER_NAMES: Record<ReadwiseSourceKind, string> = {
  articles: 'Articles',
  books: 'Books',
  podcasts: 'Podcasts',
  tweets: 'Tweets'
};

export interface DraftImportSource {
  actionMode: ImportSourceAction;
  archivePath: string;
  frequency: string;
  highlightMode: ImportHighlightMode;
  highlightPath: string;
  id: string;
  kind?: ReadwiseSourceKind;
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

function trimTrailingPathSeparators(path: string) {
  return path.replace(/[\\/]+$/, '');
}

function resolvePathSeparator(rootPath: string) {
  const matches = [...rootPath.matchAll(/[\\/]/g)];
  const lastMatch = matches.at(-1);
  return lastMatch?.[0] ?? '/';
}

function joinReadwisePath(rootPath: string, ...segments: string[]) {
  const normalizedRootPath = trimTrailingPathSeparators(rootPath.trim());
  if (!normalizedRootPath) {
    return '';
  }
  const separator = resolvePathSeparator(normalizedRootPath);
  return [normalizedRootPath, ...segments].join(separator);
}

function resolveReadwiseOriginalPath(rootPath: string, kind: ReadwiseSourceKind) {
  return joinReadwisePath(rootPath, 'Full Document Contents', READWISE_FOLDER_NAMES[kind]);
}

function resolveReadwiseHighlightPath(rootPath: string, kind: ReadwiseSourceKind) {
  return joinReadwisePath(rootPath, READWISE_FOLDER_NAMES[kind]);
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

function createReadwiseDraftImportSource(index: number, kind: ReadwiseSourceKind, rootPath = ''): DraftImportSource {
  return {
    actionMode: 'keep',
    archivePath: '',
    frequency: importFrequencyOptions[0],
    highlightMode: 'split',
    highlightPath: resolveReadwiseHighlightPath(rootPath, kind),
    id: createImportSourceId(index),
    kind,
    primaryPath: resolveReadwiseOriginalPath(rootPath, kind),
    triggerMode: 'scheduled'
  };
}

export function formatReadwiseSourceLabel(kind: ReadwiseSourceKind) {
  return READWISE_FOLDER_NAMES[kind];
}

export function createReadwiseImportSources(rootPath = '') {
  return READWISE_SOURCE_KINDS.map((kind, index) => createReadwiseDraftImportSource(index + 1, kind, rootPath));
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

export function applyReadwiseRootPath(sources: DraftImportSource[], rootPath: string) {
  return sources.map((source) => {
    if (!source.kind) {
      return source;
    }
    return {
      ...source,
      highlightPath: resolveReadwiseHighlightPath(rootPath, source.kind),
      primaryPath: resolveReadwiseOriginalPath(rootPath, source.kind)
    };
  });
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
