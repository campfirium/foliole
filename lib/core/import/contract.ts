export const IMPORT_PROVIDER_DESKTOP_TEXT_FILE = 'desktop_text_file';

export type ImportProvider = typeof IMPORT_PROVIDER_DESKTOP_TEXT_FILE;

export type ImportSourceKind = 'html' | 'markdown' | 'text';

export type ImportDuplicateSemantic = 'new' | 'updated' | 'duplicate';

export type ImportResultStatus = 'imported' | 'degraded' | 'failed';

export interface PreparedImportRecord {
  provider: ImportProvider;
  sourceName: string;
  sourceLocator: string;
  sourceKind: ImportSourceKind;
  sourceFingerprint: string;
  contentFingerprint: string;
  content: string;
  importedAt: string;
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
