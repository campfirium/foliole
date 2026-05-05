import type { KeepImportItemRow } from '../database/keepImportItems.js';

export interface KeepImportSourceSignature {
  highlight: { mtimeMs: number; sizeBytes: number } | null;
  primary: { mtimeMs: number; sizeBytes: number };
}

export function hasPrimarySourceChanged(existingItem: KeepImportItemRow | null, sourceSignature: KeepImportSourceSignature) {
  return (
    !existingItem ||
    existingItem.source_mtime_ms !== sourceSignature.primary.mtimeMs ||
    existingItem.source_size_bytes !== sourceSignature.primary.sizeBytes
  );
}

export function hasHighlightSourceChanged(existingItem: KeepImportItemRow | null, sourceSignature: KeepImportSourceSignature) {
  return (
    (existingItem?.highlight_source_mtime_ms ?? null) !== (sourceSignature.highlight?.mtimeMs ?? null) ||
    (existingItem?.highlight_source_size_bytes ?? null) !== (sourceSignature.highlight?.sizeBytes ?? null)
  );
}
