import type { useNodeSourceDetails } from './useNodeSourceDetails';

const PDF_READER_PLACEHOLDER_TEXT = 'Linked PDF source ready for the reader surface.';

export function isLikelyPdfSourceReference(content: string) {
  const normalized = content.trim();
  if (normalized.includes(PDF_READER_PLACEHOLDER_TEXT)) {
    return true;
  }
  const withoutOptionalTitle = normalized.replace(/^# .+\n+/, '').trim();
  return /^(?:https?:\/\/|file:\/\/|[A-Za-z]:[\\/]|\/|\.{1,2}\/|[^:\n]+)[^\n]*[.][Pp][Dd][Ff](?:[?#][^\n\s)]*)?$/.test(
    withoutOptionalTitle
  );
}

export function resolveImportableSourcePath(sourceDetails: ReturnType<typeof useNodeSourceDetails>) {
  const keepSourcePath = sourceDetails.value?.keepImportItem?.resolvedSourcePath?.trim();
  if (keepSourcePath) {
    return keepSourcePath;
  }
  return sourceDetails.value?.importSource?.sourceLocator.trim() || null;
}
