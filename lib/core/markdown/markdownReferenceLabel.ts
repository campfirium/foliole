export function normalizeMarkdownReferenceLabel(value: string) {
  return value.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}
