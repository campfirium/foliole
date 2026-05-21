export type EpubImportReleaseMode = 'free' | 'sequential';

export function detectEpubPreviewHighlights(content: string) {
  return /==[^=\n][\s\S]*?==/.test(content) || /<mark(?:\s[^>]*)?>[\s\S]*?<\/mark>/i.test(content);
}

export function resolveDefaultEpubReleaseMode(content: string): EpubImportReleaseMode {
  return detectEpubPreviewHighlights(content) ? 'free' : 'sequential';
}
