export function normalizeComparableSourcePreviewContent(content: string) {
  return normalizeNodeSourcePreviewContent(content).trim();
}

export function normalizeNodeSourcePreviewContent(content: string) {
  return content.replace(/\r\n?/g, '\n');
}
