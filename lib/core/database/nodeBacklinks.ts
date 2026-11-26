import type { DatabaseDriver, DatabaseRow } from './driver.js';

const WIKI_LINK_PATTERN = /(?<!!)\[\[([^\]\n]+)\]\]/g;

interface TargetNodeRow extends DatabaseRow {
  id: string;
  title: string;
}

interface BacklinkSourceRow extends DatabaseRow {
  id: string;
  title: string;
  content: string;
}

export interface NodeBacklinkRecord {
  source_node_id: string;
  source_title: string;
  context: string;
  match_count: number;
}

export interface NodeBacklinkSourceChange {
  nodeId: string;
  titleChanged: boolean;
  outgoingLinksChanged: boolean;
}

function normalizeTitle(value: string) {
  return value.trim().toLocaleLowerCase();
}

function normalizeContextLine(line: string) {
  return line.replace(/\s+/g, ' ').trim();
}

function buildBacklinkContext(content: string, matchIndex: number) {
  const lineStart = content.lastIndexOf('\n', matchIndex - 1) + 1;
  const lineEndIndex = content.indexOf('\n', matchIndex);
  const lineEnd = lineEndIndex >= 0 ? lineEndIndex : content.length;
  const normalized = normalizeContextLine(content.slice(lineStart, lineEnd));
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 137).trimEnd()}...`;
}

function collectMatchingLinkOffsets(content: string, normalizedTargetTitle: string) {
  const offsets: number[] = [];
  let match = WIKI_LINK_PATTERN.exec(content);
  while (match) {
    const title = (match[1] ?? '').trim();
    if (title && normalizeTitle(title) === normalizedTargetTitle) {
      offsets.push(match.index);
    }
    match = WIKI_LINK_PATTERN.exec(content);
  }
  WIKI_LINK_PATTERN.lastIndex = 0;
  return offsets;
}

function summarizeBacklinkSource(content: string) {
  const targets = new Map<string, { count: number; context: string }>();
  for (const match of content.matchAll(WIKI_LINK_PATTERN)) {
    const title = normalizeTitle(match[1] ?? '');
    if (!title) continue;
    const existing = targets.get(title);
    if (existing) existing.count++;
    else targets.set(title, { count: 1, context: buildBacklinkContext(content, match.index) });
  }
  return targets;
}

function didOutgoingBacklinksChange(previous: string, next: string) {
  if (previous === next || (!previous.includes('[[') && !next.includes('[['))) return false;
  const previousTargets = summarizeBacklinkSource(previous);
  const nextTargets = summarizeBacklinkSource(next);
  if (previousTargets.size !== nextTargets.size) return true;
  for (const [title, before] of previousTargets) {
    const after = nextTargets.get(title);
    if (after?.count !== before.count || after.context !== before.context) return true;
  }
  return false;
}

type BacklinkSourceSnapshot = Pick<BacklinkSourceRow, 'title' | 'content'>;

export function readNodeBacklinkSource(driver: DatabaseDriver, nodeId: string, updatedAnchorIds: readonly string[] = []) {
  const sql = 'SELECT title, content FROM nodes WHERE id = ? AND deleted_at IS NULL';
  if (!updatedAnchorIds.length) return driver.queryOne<BacklinkSourceSnapshot>(sql, [nodeId]);
  // Explicit anchor updates can restore rows. In that case the parent alone cannot describe the change.
  return driver.queryOne<BacklinkSourceSnapshot>(`${sql} AND NOT EXISTS (
    SELECT 1 FROM nodes WHERE deleted_at IS NOT NULL AND id IN (SELECT value FROM json_each(?))
  )`, [nodeId, JSON.stringify(updatedAnchorIds)]);
}

export function describeNodeBacklinkSourceChange(nodeId: string,
  previous: BacklinkSourceSnapshot | undefined, current: BacklinkSourceSnapshot | undefined): NodeBacklinkSourceChange | undefined {
  if (!previous || !current) return undefined;
  return { nodeId, titleChanged: previous.title !== current.title,
    outgoingLinksChanged: didOutgoingBacklinksChange(previous.content, current.content) };
}

export const NODE_BACKLINK_TARGET_SQL = `SELECT id, title
     FROM nodes
     WHERE id = ?
       AND deleted_at IS NULL`;

export const NODE_BACKLINK_SOURCES_SQL = `SELECT id, title, content
     FROM nodes
     WHERE id != ?
       AND deleted_at IS NULL
       AND instr(content, '[[') > 0
     ORDER BY rowid`;

// Letters another character lowercases into under some locale: K (U+212A) -> k, and
// I-dot (U+0130, plus Lithuanian accented I) -> i. A link can spell these differently.
const UNSTABLE_ASCII_LETTERS = new Set(['i', 'k']);
const COMBINING_MARK = /\p{M}/u;

/** Whether every link that matches the title must contain this character, in ASCII-folded form. */
function isStableNeedleCharacter(character: string) {
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x80) return !UNSTABLE_ASCII_LETTERS.has(character.toLowerCase());
  // Non-ASCII characters only qualify when caseless; combining marks also appear in
  // the lowercase of other characters (U+0130 -> i + U+0307), so they never qualify.
  return character.toLocaleLowerCase() === character && character.toLocaleUpperCase() === character
    && !COMBINING_MARK.test(character);
}

function foldAsciiCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * Runs of the trimmed target title that every matching link must contain once ASCII case is
 * folded (SQLite lower() folds ASCII; non-ASCII runs are caseless and kept verbatim). Each run
 * is a lossless SQL prefilter; titles without stable characters return no needles.
 */
export function nodeBacklinkTitleNeedles(title: string) {
  const needles = new Set<string>();
  let current = '';
  for (const character of `${title.trim()}\n`) {
    if (character !== '\n' && isStableNeedleCharacter(character)) {
      current += character;
      continue;
    }
    if (current.trim()) needles.add(foldAsciiCase(current));
    current = '';
  }
  return [...needles];
}

/** Sources SQL with lossless title prefilters; params: [targetNodeId, ...needles]. */
export function nodeBacklinkSourcesQuery(targetNodeId: string, targetTitle: string) {
  const needles = nodeBacklinkTitleNeedles(targetTitle);
  const filters = needles.map(() => 'AND instr(lower(content), ?) > 0\n     ').join('');
  return {
    sql: NODE_BACKLINK_SOURCES_SQL.replace('ORDER BY rowid', `${filters}ORDER BY rowid`),
    params: [targetNodeId, ...needles]
  };
}

export function collectNodeBacklinkRecords(
  targetNode: { title: string } | null | undefined,
  sources: readonly { id: string; title: string; content: string }[]
): NodeBacklinkRecord[] {
  const normalizedTargetTitle = normalizeTitle(targetNode?.title ?? '');
  if (!targetNode || !normalizedTargetTitle) {
    return [];
  }

  return sources.flatMap((node) => {
    const matchOffsets = collectMatchingLinkOffsets(node.content, normalizedTargetTitle);
    const firstMatchOffset = matchOffsets[0];
    if (firstMatchOffset === undefined) {
      return [];
    }
    return [{
      source_node_id: node.id,
      source_title: node.title.trim() || 'Untitled',
      context: buildBacklinkContext(node.content, firstMatchOffset) || node.title.trim() || 'Untitled',
      match_count: matchOffsets.length
    }];
  });
}

export function loadNodeBacklinks(driver: DatabaseDriver, targetNodeId: string): NodeBacklinkRecord[] {
  const targetNode = driver.queryOne<TargetNodeRow>(NODE_BACKLINK_TARGET_SQL, [targetNodeId]);
  if (!normalizeTitle(targetNode?.title ?? '')) {
    return [];
  }
  const query = nodeBacklinkSourcesQuery(targetNodeId, targetNode?.title ?? '');
  return collectNodeBacklinkRecords(targetNode, driver.queryAll<BacklinkSourceRow>(query.sql, query.params));
}
