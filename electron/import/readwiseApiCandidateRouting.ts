export function matchesReadwiseDocumentImportTag(
  tags: Record<string, unknown> | null | undefined,
  importTag: string
) {
  const target = normalizeTag(importTag);
  if (!target || !tags) return false;
  return Object.entries(tags).some(([key, value]) =>
    normalizeTag(key) === target || tagName(value) === target);
}

function tagName(value: unknown) {
  if (typeof value === 'string') return normalizeTag(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const name = (value as Record<string, unknown>).name;
  return typeof name === 'string' ? normalizeTag(name) : '';
}

function normalizeTag(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}
