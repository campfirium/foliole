export const IMPORT_PROVIDER_DESKTOP_TEXT_FILE = 'desktop_text_file';

export type ImportProvider = typeof IMPORT_PROVIDER_DESKTOP_TEXT_FILE;

export type ImportSourceKind = 'epub' | 'html' | 'markdown' | 'pdf' | 'text';

export type ImportHighlightPolicy = 'adopt' | 'reference_only';

export type ImportDuplicateSemantic = 'new' | 'updated' | 'duplicate';

export type ImportResultStatus = 'imported' | 'degraded' | 'failed';

export type PreparedImportSourceProfile = 'default' | 'epub' | 'body_with_highlight_sidecar';

export type ImportSourceTrackingMode = 'tracked' | 'untracked';

export interface PreparedImportHighlightRecord {
  content: string;
  label: string | null;
  locatorText?: string | null;
}

export interface PreparedImportEmbeddedImage {
  bytes: Uint8Array;
  destination: string;
  mimeType: string;
  originalName: string;
}

export interface PreparedImportRecord {
  provider: ImportProvider;
  sourceName: string;
  nodeTitle: string;
  hideTitleHeading: boolean;
  sourceLocator: string;
  sourceKind: ImportSourceKind;
  sourceFingerprint: string;
  contentFingerprint: string;
  content: string;
  matchedHighlights?: PreparedImportHighlightRecord[];
  degradedReason: string | null;
  importedAt: string;
  sourceProfile?: PreparedImportSourceProfile;
  sourceTrackingMode?: ImportSourceTrackingMode;
}

export interface PersistedImportRecord {
  importId: string;
  provider: ImportProvider;
  sourceName: string;
  sourceLocator: string;
  sourceKind: ImportSourceKind;
  sourceFingerprint: string;
  contentFingerprint: string;
  duplicateSemantic: ImportDuplicateSemantic;
  resultStatus: ImportResultStatus;
  importedAt: string;
  nodeId: string | null;
  degradedReason: string | null;
  failureReason: string | null;
}
