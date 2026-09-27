import { normalizeSearchAlias } from '../search/searchAliasDocument.js';

export function indexSearchAliases(groups: string[][]) {
  const index = new Map<string, string[][]>();
  for (const group of groups) {
    if (group.length < 2) continue;
    const normalized = group.map(normalizeSearchAlias);
    for (const spelling of normalized) {
      const first = spelling.split(' ')[0] ?? '';
      index.set(first, [...(index.get(first) ?? []), [spelling, ...normalized.filter((item) => item !== spelling)]]);
    }
  }
  for (const candidates of index.values()) candidates.sort((left, right) => (right[0]?.length ?? 0) - (left[0]?.length ?? 0));
  return index;
}
