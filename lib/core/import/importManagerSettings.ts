import {
  normalizeImportSourceAction,
  type ImportSourceAction
} from './importSourceActions.js';
import {
  normalizeKeepImportPreview,
  type KeepImportPreviewSummary
} from './keepImportPreviewSettings.js';
import {
  createDefaultReadwiseReaderConfig,
  normalizeReadwiseReaderConfig,
  type ReadwiseReaderConfig
} from './readwiseReaderSettings.js';

export type ImportHighlightMode = 'merged' | 'split';
export type ReadwiseSourceKind = 'books' | 'articles' | 'tweets' | 'podcasts';
export type KeepImportRuleState = 'draft' | 'enabled' | 'previewed';

export interface ImportManagerSourceDraft {
  actionMode: ImportSourceAction;
  archivePath: string;
  highlightMode: ImportHighlightMode;
  highlightPath: string;
  id: string;
  kind?: ReadwiseSourceKind;
  keepPreview: KeepImportPreviewSummary | null;
  keepState: KeepImportRuleState;
  primaryPath: string;
}

export interface ImportManagerSettings {
  detailsOpen: boolean;
  readwiseReaderConfig: ReadwiseReaderConfig;
  readwiseRootPath: string;
  readwiseSources: ImportManagerSourceDraft[];
  sources: ImportManagerSourceDraft[];
  updatedAt: string;
  version: number;
}

const IMPORT_MANAGER_SETTINGS_VERSION = 3;
const DEFAULT_UPDATED_AT = '1970-01-01T00:00:00.000Z';
const READWISE_SOURCE_KINDS: ReadwiseSourceKind[] = ['articles', 'books', 'tweets', 'podcasts'];
const READWISE_FOLDER_NAMES: Record<ReadwiseSourceKind, string> = {
  articles: 'Articles',
  books: 'Books',
  podcasts: 'Podcasts',
  tweets: 'Tweets'
};

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

function normalizeKeepImportRuleState(value: unknown, fallback: KeepImportRuleState) {
  return value === 'draft' || value === 'enabled' || value === 'previewed' ? value : fallback;
}

function normalizeSource(
  value: unknown,
  fallback: ImportManagerSourceDraft,
  kind?: ReadwiseSourceKind
): ImportManagerSourceDraft {
  const payload = isRecord(value) ? value : {};
  const highlightMode = normalizeHighlightMode(payload.highlightMode, fallback.highlightMode);

  return {
    actionMode: normalizeImportSourceAction(payload.actionMode, fallback.actionMode),
    archivePath: normalizeString(payload.archivePath, fallback.archivePath),
    highlightMode,
    highlightPath: highlightMode === 'split' ? normalizeString(payload.highlightPath, fallback.highlightPath) : '',
    id: normalizeString(payload.id, fallback.id).trim() || fallback.id,
    kind,
    keepPreview: normalizeKeepImportPreview(payload.keepPreview),
    keepState: normalizeKeepImportRuleState(payload.keepState, fallback.keepState),
    primaryPath: normalizeString(payload.primaryPath, fallback.primaryPath)
  };
}

export function createDraftImportSource(index: number): ImportManagerSourceDraft {
  return {
    actionMode: 'keep',
    archivePath: '',
    highlightMode: 'merged',
    highlightPath: '',
    id: createImportSourceId(index),
    keepPreview: null,
    keepState: 'draft',
    primaryPath: ''
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
    highlightMode: 'split',
    highlightPath: resolveReadwiseHighlightPath(rootPath, kind),
    id: createImportSourceId(index),
    kind,
    keepPreview: null,
    keepState: 'draft',
    primaryPath: resolveReadwiseOriginalPath(rootPath, kind)
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
      keepPreview: null,
      keepState: 'draft' as KeepImportRuleState,
      primaryPath: resolveReadwiseOriginalPath(rootPath, source.kind)
    };
  });
}

export function createDefaultImportManagerSettings(): ImportManagerSettings {
  return {
    detailsOpen: true,
    readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
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
    readwiseReaderConfig: normalizeReadwiseReaderConfig(value.readwiseReaderConfig),
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

export type { KeepImportPreviewSummary } from './keepImportPreviewSettings.js';
