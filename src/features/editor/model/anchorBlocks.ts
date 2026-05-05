export type AnchorKind = 'highlight' | 'cloze';

export interface AnchorBlockPayload {
  id: string;
  kind: AnchorKind;
}

export interface ParsedAnchorBlock {
  closeTagFrom: number;
  closeTagTo: number;
  contentFrom: number;
  contentTo: number;
  from: number;
  id: string;
  kind: AnchorKind;
  openTagFrom: number;
  openTagTo: number;
  to: number;
}

export interface InvalidAnchorToken {
  from: number;
  reason: 'duplicate-open' | 'invalid-close' | 'invalid-open' | 'unclosed-open';
  to: number;
}

export interface ParsedAnchorBlocksResult {
  blocks: ParsedAnchorBlock[];
  invalidTokens: InvalidAnchorToken[];
}

interface AnchorToken {
  from: number;
  id?: string;
  kind: AnchorKind;
  slash: boolean;
  to: number;
}

interface OpenAnchorToken extends AnchorToken {
  id: string;
  slash: false;
}

interface CloseAnchorToken extends AnchorToken {
  id: string;
  slash: true;
}

const TOKEN_PATTERN = /<(\/?)(highlight|cloze)(?:\s+id="([^"]+)")?\s*>/g;
const ANCHOR_MARKUP_PATTERN = /<\/?(?:highlight|cloze)\b/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function isAnchorKind(value: string): value is AnchorKind {
  return value === 'highlight' || value === 'cloze';
}

function isValidAnchorId(value: string): boolean {
  return ID_PATTERN.test(value);
}

function normalizePayload(payload: AnchorBlockPayload): AnchorBlockPayload {
  if (!isAnchorKind(payload.kind) || !isValidAnchorId(payload.id)) {
    throw new Error('Invalid anchor payload');
  }
  return payload;
}

function asOpenToken(token: AnchorToken): OpenAnchorToken | null {
  if (token.slash || !token.id) {
    return null;
  }
  return {
    from: token.from,
    id: token.id,
    kind: token.kind,
    slash: false,
    to: token.to
  };
}

function asCloseToken(token: AnchorToken): CloseAnchorToken | null {
  if (!token.slash || !token.id) {
    return null;
  }
  return {
    from: token.from,
    id: token.id,
    kind: token.kind,
    slash: true,
    to: token.to
  };
}

function createTokenKey(token: { id: string; kind: AnchorKind }) {
  return `${token.kind}:${token.id}`;
}

function tokenize(content: string): AnchorToken[] {
  const tokens: AnchorToken[] = [];
  for (const match of content.matchAll(TOKEN_PATTERN)) {
    const raw = match[0];
    const slash = match[1] === '/';
    const kind = match[2];
    const id = match[3];
    const from = match.index ?? -1;
    const to = from + raw.length;

    if (from < 0 || !isAnchorKind(kind)) {
      continue;
    }

    if (!id || !isValidAnchorId(id)) {
      tokens.push({ from, kind, slash, to });
      continue;
    }

    tokens.push({ from, id, kind, slash, to });
  }
  return tokens;
}

export function serializeAnchorBlock(payload: AnchorBlockPayload): string {
  const normalized = normalizePayload(payload);
  return `<${normalized.kind} id="${normalized.id}"></${normalized.kind} id="${normalized.id}">`;
}

export function serializeAnchorTag(payload: AnchorBlockPayload, slash: boolean): string {
  const normalized = normalizePayload(payload);
  return `<${slash ? '/' : ''}${normalized.kind} id="${normalized.id}">`;
}

export function wrapAnchorText(content: string, payload: AnchorBlockPayload): string {
  const normalized = normalizePayload(payload);
  return `${serializeAnchorTag(normalized, false)}${content}${serializeAnchorTag(normalized, true)}`;
}

export function parseAnchorBlock(value: string): AnchorBlockPayload | null {
  const match = value.match(/^<(highlight|cloze)\s+id="([^"]+)"><\/\1\s+id="\2">$/);
  if (!match) {
    return null;
  }

  const kind = match[1];
  const id = match[2];
  if (!isAnchorKind(kind) || !isValidAnchorId(id)) {
    return null;
  }

  return { id, kind };
}

export function parseAnchorBlocks(content: string): ParsedAnchorBlocksResult {
  const blocks: ParsedAnchorBlock[] = [];
  const invalidTokens: InvalidAnchorToken[] = [];
  const tokens = tokenize(content);
  const openTokensByKey = new Map<string, OpenAnchorToken>();

  for (const token of tokens) {
    if (!token.slash) {
      const openToken = asOpenToken(token);
      if (!openToken) {
        invalidTokens.push({ from: token.from, reason: 'invalid-open', to: token.to });
        continue;
      }
      const key = createTokenKey(openToken);
      if (openTokensByKey.has(key)) {
        invalidTokens.push({ from: token.from, reason: 'duplicate-open', to: token.to });
        continue;
      }
      openTokensByKey.set(key, openToken);
      continue;
    }

    const closeToken = asCloseToken(token);
    if (!closeToken) {
      invalidTokens.push({ from: token.from, reason: 'invalid-close', to: token.to });
      continue;
    }

    const key = createTokenKey(closeToken);
    const openToken = openTokensByKey.get(key);
    if (!openToken) {
      invalidTokens.push({ from: token.from, reason: 'invalid-close', to: token.to });
      continue;
    }

    blocks.push({
      closeTagFrom: closeToken.from,
      closeTagTo: closeToken.to,
      contentFrom: openToken.to,
      contentTo: closeToken.from,
      from: openToken.from,
      id: openToken.id,
      kind: openToken.kind,
      openTagFrom: openToken.from,
      openTagTo: openToken.to,
      to: closeToken.to
    });
    openTokensByKey.delete(key);
  }

  const unclosedTokens = [...openTokensByKey.values()].sort((left, right) => left.from - right.from);
  for (const openToken of unclosedTokens) {
    invalidTokens.push({
      from: openToken.from,
      reason: 'unclosed-open',
      to: openToken.to
    });
  }

  return { blocks, invalidTokens };
}

export function extractAnchorBlocks(content: string): ParsedAnchorBlock[] {
  return parseAnchorBlocks(content).blocks;
}

export function hasInlineAnchorMarkup(content: string): boolean {
  return ANCHOR_MARKUP_PATTERN.test(content);
}

export function stripAnchorBlocks(content: string): string {
  return content.replace(TOKEN_PATTERN, '');
}

export function appendAnchorBlock(content: string, payload: AnchorBlockPayload): string {
  const anchorBlock = serializeAnchorBlock(payload);
  if (!content) {
    return anchorBlock;
  }
  return content.endsWith('\n') ? `${content}${anchorBlock}` : `${content}\n${anchorBlock}`;
}
