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
  reason: 'invalid-close' | 'invalid-open' | 'nested-not-allowed' | 'unclosed-open';
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

const TOKEN_PATTERN = /<(\/?)(highlight|cloze)(?:\s+id="([^"]+)")?\s*>/g;
const ID_PATTERN = /^[1-9]\d*$/;

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

    if (!slash) {
      if (!id || !isValidAnchorId(id)) {
        tokens.push({ from, kind, slash, to });
        continue;
      }

      tokens.push({ from, id, kind, slash, to });
      continue;
    }

    if (id !== undefined) {
      tokens.push({ from, kind, slash, to });
      continue;
    }

    tokens.push({ from, kind, slash, to });
  }
  return tokens;
}

export function serializeAnchorBlock(payload: AnchorBlockPayload): string {
  const normalized = normalizePayload(payload);
  return `<${normalized.kind} id="${normalized.id}"></${normalized.kind}>`;
}

export function parseAnchorBlock(value: string): AnchorBlockPayload | null {
  const match = value.match(/^<(highlight|cloze)\s+id="([^"]+)"><\/\1>$/);
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
  let activeToken: OpenAnchorToken | null = null;
  let activeTokenTainted = false;

  for (const token of tokens) {
    if (!token.slash) {
      const openToken = asOpenToken(token);
      if (!openToken) {
        invalidTokens.push({ from: token.from, reason: 'invalid-open', to: token.to });
        continue;
      }
      if (activeToken) {
        invalidTokens.push({ from: token.from, reason: 'nested-not-allowed', to: token.to });
        activeTokenTainted = true;
        continue;
      }
      activeToken = openToken;
      activeTokenTainted = false;
      continue;
    }

    if (!activeToken || activeToken.kind !== token.kind) {
      invalidTokens.push({ from: token.from, reason: 'invalid-close', to: token.to });
      if (activeToken) {
        activeTokenTainted = true;
      }
      continue;
    }

    if (!activeTokenTainted) {
      blocks.push({
        closeTagFrom: token.from,
        closeTagTo: token.to,
        contentFrom: activeToken.to,
        contentTo: token.from,
        from: activeToken.from,
        id: activeToken.id,
        kind: activeToken.kind,
        openTagFrom: activeToken.from,
        openTagTo: activeToken.to,
        to: token.to
      });
    }
    activeToken = null;
    activeTokenTainted = false;
  }

  if (activeToken) {
    invalidTokens.push({
      from: activeToken.from,
      reason: 'unclosed-open',
      to: activeToken.to
    });
  }

  return { blocks, invalidTokens };
}

export function extractAnchorBlocks(content: string): ParsedAnchorBlock[] {
  return parseAnchorBlocks(content).blocks;
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
