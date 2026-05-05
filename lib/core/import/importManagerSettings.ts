export type ImportHighlightMode = 'merged' | 'split';
export type ImportSourceAction = 'delete' | 'keep' | 'move';
export type ImportTriggerMode = 'manual' | 'scheduled';
export type ReadwiseSourceKind = 'books' | 'articles' | 'tweets' | 'podcasts';

export interface ImportManagerSourceDraft {
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

export interface ImportManagerSettings {
  detailsOpen: boolean;
  readwiseRootPath: string;
  readwiseSources: ImportManagerSourceDraft[];
  sources: ImportManagerSourceDraft[];
  updatedAt: string;
  version: number;
}

const IMPORT_MANAGER_SETTINGS_VERSION = 1;
const DEFAULT_UPDATED_AT = '1970-01-01T00:00:00.000Z';
const READWISE_SOURCE_KINDS: ReadwiseSourceKind[] = ['articles', 'books', 'tweets', 'podcasts'];
const READWISE_FOLDER_NAMES: Record<ReadwiseSourceKind, string> = {
  articles: 'Articles',
  books: 'Books',
  podcasts: 'Podcasts',
  tweets: 'Tweets'
};

export const importFrequencyOptions = ['5 min', '15 min', '30 min', '1 hour', '4 hours', '24 hours'];
export const importActionOptions = [
  { label: 'Keep', value: 'keep' },
  { label: 'Delete', value: 'delete' },
  { label: 'Move', value: 'move' }
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeHighlightMode(value: unknown, fallback: ImportHighlightMode) {
  return value === 'split' || value === 'merged' ? value : fallback;
}

function normalizeTriggerMode(value: unknown, fallback: ImportTriggerMode) {
  return value === 'manual' || value === 'scheduled' ? value : fallback;
}

function normalizeActionMode(value: unknown, fallback: ImportSourceAction) {
  return value === 'keep' || value === 'delete' || value === 'move' ? value : fallback;
}

function normalizeFrequency(value: unknown, fallback: string) {
  return typeof value === 'string' && importFrequencyOptions.includes(value) ? value : fallback;
}

function normalizeSource(
  value: unknown,
  fallback: ImportManagerSourceDraft,
  kind?: ReadwiseSourceKind
): ImportManagerSourceDraft {
  const payload = isRecord(value) ? value : {};
  const highlightMode = normalizeHighlightMode(payload.highlightMode, fallback.highlightMode);
  const actionMode = normalizeActionMode(payload.actionMode, fallback.actionMode);

  return {
    actionMode,
    archivePath: actionMode === 'move' ? normalizeString(payload.archivePath, fallback.archivePath) : '',
    frequency: normalizeFrequency(payload.frequency, fallback.frequency),
    highlightMode,
    highlightPath: highlightMode === 'split' ? normalizeString(payload.highlightPath, fallback.highlightPath) : '',
    id: normalizeString(payload.id, fallback.id).trim() || fallback.id,
    kind,
    primaryPath: normalizeString(payload.primaryPath, fallback.primaryPath),
    triggerMode: normalizeTriggerMode(payload.triggerMode, fallback.triggerMode)
  };
}

export function createDraftImportSource(index: number): ImportManagerSourceDraft {
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

function createReadwiseDraftImportSource(
  index: number,
  kind: ReadwiseSourceKind,
  rootPath = ''
): ImportManagerSourceDraft {
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

export function createDefaultGenericImportSources() {
  return [createDraftImportSource(101), createDraftImportSource(102)];
}

export function createReadwiseImportSources(rootPath = '') {
  return READWISE_SOURCE_KINDS.map((kind, index) => createReadwiseDraftImportSource(index + 1, kind, rootPath));
}

export function applyReadwiseRootPath(sources: ImportManagerSourceDraft[], rootPath: string) {
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

export function createDefaultImportManagerSettings(): ImportManagerSettings {
  return {
    detailsOpen: true,
    readwiseRootPath: '',
    readwiseSources: createReadwiseImportSources(),
    sources: createDefaultGenericImportSources(),
    updatedAt: DEFAULT_UPDATED_AT,
    version: IMPORT_MANAGER_SETTINGS_VERSION
  };
}

export function normalizeImportManagerSettings(value: unknown): ImportManagerSettings {
  const defaults = createDefaultImportManagerSettings();
  if (!isRecord(value)) {
    return defaults;
  }

  const readwiseRootPath = normalizeString(value.readwiseRootPath);
  const defaultReadwiseSources = createReadwiseImportSources(readwiseRootPath);
  const readwiseByKind = Array.isArray(value.readwiseSources)
    ? value.readwiseSources.reduce<Partial<Record<ReadwiseSourceKind, unknown>>>((accumulator, item) => {
        if (!isRecord(item)) {
          return accumulator;
        }
        const kind = item.kind;
        if (kind === 'articles' || kind === 'books' || kind === 'tweets' || kind === 'podcasts') {
          accumulator[kind] = item;
        }
        return accumulator;
      }, {})
    : {};
  const sources = Array.isArray(value.sources)
    ? value.sources
        .map((item, index) => normalizeSource(item, createDraftImportSource(index + 101)))
        .filter((source) => source.id.trim().length > 0)
    : [];

  return {
    detailsOpen: typeof value.detailsOpen === 'boolean' ? value.detailsOpen : defaults.detailsOpen,
    readwiseRootPath,
    readwiseSources: defaultReadwiseSources.map((source) =>
      normalizeSource(readwiseByKind[source.kind as ReadwiseSourceKind], source, source.kind)
    ),
    sources: sources.length > 0 ? sources : defaults.sources,
    updatedAt: normalizeString(value.updatedAt, DEFAULT_UPDATED_AT),
    version: IMPORT_MANAGER_SETTINGS_VERSION
  };
}

export function createNextImportSourceIndex(sources: ImportManagerSourceDraft[], fallback = 101) {
  return sources.reduce((maxIndex, source) => {
    const match = source.id.match(/(\d+)$/);
    if (!match) {
      return maxIndex;
    }
    return Math.max(maxIndex, Number(match[1]));
  }, fallback - 1) + 1;
}

export function formatReadwiseSourceLabel(kind: ReadwiseSourceKind) {
  return READWISE_FOLDER_NAMES[kind];
}
