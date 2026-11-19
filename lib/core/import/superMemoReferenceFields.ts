export const SUPER_MEMO_REFERENCE_FIELDS = ['Title', 'Author', 'Link', 'Date', 'Source', 'Comment', 'Article'] as const;

type ReferenceField = typeof SUPER_MEMO_REFERENCE_FIELDS[number];
export type SuperMemoReferenceMap = Partial<Record<ReferenceField, string>>;
type ReferenceValues = Partial<Record<ReferenceField, string | undefined>>;

export function isValidSuperMemoReferenceMap(mapping: SuperMemoReferenceMap) {
  const keys = SUPER_MEMO_REFERENCE_FIELDS.filter(field => field !== 'Article').map(field => (mapping[field] ?? field).trim()).filter(Boolean);
  return keys.every(key => key.length <= 64 && !/^[-#]|[:\r\n]/u.test(key)) &&
    new Set(keys.map(key => key.toLowerCase())).size === keys.length;
}

export function mappedSuperMemoReferences(mapping: SuperMemoReferenceMap, values: ReferenceValues): [string, string][] {
  return SUPER_MEMO_REFERENCE_FIELDS.flatMap(field => {
    const key = (mapping[field] ?? field).trim();
    const value = values[field];
    return key && value ? [[key, value]] : [];
  });
}
