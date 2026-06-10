function normalizeImportSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function matchesImportSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = normalizeImportSearchQuery(query);
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}
