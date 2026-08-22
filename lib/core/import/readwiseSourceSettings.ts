import type { ImportManagerSourceDraft, ReadwiseSourceKind } from './importManagerSettings.js';
import { normalizeKeepImportPreview } from './keepImportPreviewSettings.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readKind(value: unknown, fallback?: ReadwiseSourceKind) {
  return value === 'articles' || value === 'books' || value === 'podcasts' || value === 'tweets'
    ? value
    : fallback;
}

export function readwiseSourceTypeSettings(source: ImportManagerSourceDraft) {
  return {
    actionMode: source.actionMode,
    archivePath: source.archivePath,
    highlightMode: source.highlightMode,
    highlightPath: source.highlightPath,
    keepPreview: source.keepPreview,
    keepState: source.keepState,
    kind: source.kind ?? null
  };
}

export function applyReadwiseSourceTypeSettings(
  source: ImportManagerSourceDraft,
  value: unknown
): ImportManagerSourceDraft {
  const payload = isRecord(value) ? value : {};
  const actionMode = payload.actionMode === 'delete' ? 'delete' : source.actionMode;
  const highlightMode = payload.highlightMode === 'merged' || payload.highlightMode === 'split'
    ? payload.highlightMode
    : source.highlightMode;
  const keepState = payload.keepState === 'enabled' || payload.keepState === 'previewed'
    ? payload.keepState
    : 'draft';
  const kind = readKind(payload.kind, source.kind);
  return {
    ...source,
    actionMode,
    archivePath: typeof payload.archivePath === 'string' ? payload.archivePath : source.archivePath,
    highlightMode,
    highlightPath: typeof payload.highlightPath === 'string' ? payload.highlightPath : source.highlightPath,
    keepPreview: normalizeKeepImportPreview(payload.keepPreview),
    keepState,
    ...(kind ? { kind } : {})
  };
}
