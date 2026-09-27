export interface SearchAliasDocument {
  groups: string[][];
  text: string;
}

export class SearchAliasDocumentError extends Error {
  constructor(message: string, readonly line: number) {
    super(`Line ${line}: ${message}`);
    this.name = 'SearchAliasDocumentError';
  }
}

export function normalizeSearchAlias(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

export function parseSearchAliasDocument(source: string): SearchAliasDocument {
  const text = source.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  const groups: string[][] = [];
  const owners = new Map<string, number>();
  const lines = text.split('\n');
  for (const [index, rawLine] of lines.entries()) {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = rawLine.split('|').map((part) => part.trim());
    if (parts.some((part) => !part)) {
      throw new SearchAliasDocumentError('Each spelling must contain text.', line);
    }
    const group: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const key = normalizeSearchAlias(part);
      if (!key) throw new SearchAliasDocumentError('Each spelling must contain text.', line);
      if (seen.has(key)) continue;
      const owner = owners.get(key);
      if (owner !== undefined) {
        throw new SearchAliasDocumentError(`Spelling already belongs to line ${owner}.`, line);
      }
      seen.add(key);
      group.push(part);
    }
    for (const key of seen) owners.set(key, line);
    groups.push(group);
  }
  return { groups, text };
}
