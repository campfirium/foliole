export type ImportedAnchorKind = 'highlight' | 'cloze';

export interface ImportedAnchorBlock {
  closeTagFrom: number;
  closeTagTo: number;
  contentFrom: number;
  contentTo: number;
  id: string;
  kind: ImportedAnchorKind;
  openTagFrom: number;
  openTagTo: number;
}

interface ImportedAnchorToken {
  from: number;
  id?: string;
  kind: ImportedAnchorKind;
  slash: boolean;
  to: number;
}

const IMPORTED_ANCHOR_TOKEN_PATTERN = /<(\/?)(highlight|cloze)(?:\s+id="([^"]+)")?\s*>/g;
const IMPORTED_ANCHOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function isImportedAnchorKind(value: string): value is ImportedAnchorKind {
  return value === 'highlight' || value === 'cloze';
}

function tokenizeImportedAnchorMarkup(content: string): ImportedAnchorToken[] {
  const tokens: ImportedAnchorToken[] = [];
  for (const match of content.matchAll(IMPORTED_ANCHOR_TOKEN_PATTERN)) {
    const raw = match[0] ?? '';
    const from = match.index ?? -1;
    const kind = match[2];
    if (from < 0 || !isImportedAnchorKind(kind)) {
      continue;
    }
    const id = match[3];
    tokens.push({
      from,
      id: id && IMPORTED_ANCHOR_ID_PATTERN.test(id) ? id : undefined,
      kind,
      slash: match[1] === '/',
      to: from + raw.length
    });
  }
  return tokens;
}

export function extractImportedAnchorBlocks(content: string): ImportedAnchorBlock[] {
  const blocks: ImportedAnchorBlock[] = [];
  const openTokensByKey = new Map<string, ImportedAnchorToken>();

  for (const token of tokenizeImportedAnchorMarkup(content)) {
    if (!token.id) {
      continue;
    }
    const key = `${token.kind}:${token.id}`;
    if (!token.slash) {
      if (!openTokensByKey.has(key)) {
        openTokensByKey.set(key, token);
      }
      continue;
    }
    const openToken = openTokensByKey.get(key);
    if (!openToken) {
      continue;
    }
    blocks.push({
      closeTagFrom: token.from,
      closeTagTo: token.to,
      contentFrom: openToken.to,
      contentTo: token.from,
      id: token.id,
      kind: token.kind,
      openTagFrom: openToken.from,
      openTagTo: openToken.to
    });
    openTokensByKey.delete(key);
  }

  return blocks;
}

export function stripImportedAnchorMarkup(content: string): string {
  return content.replace(IMPORTED_ANCHOR_TOKEN_PATTERN, '');
}
