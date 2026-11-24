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

function isCaseless(character: string) {
  return character.toLocaleLowerCase() === character && character.toLocaleUpperCase() === character;
}

/**
 * Longest run of caseless characters (CJK, digits, punctuation, inner spaces) in the
 * normalized target title. Every matching link must contain this run verbatim, so it is
 * a lossless SQL prefilter; titles made only of cased letters return null.
 */
export function nodeBacklinkCaselessNeedle(title: string) {
  const normalized = title.trim();
  let best = '';
  let current = '';
  for (const character of normalized) {
    if (isCaseless(character)) {
      current += character;
      if (current.length > best.length) best = current;
    } else {
      current = '';
    }
  }
  return best.trim() ? best : null;
}

/** Sources SQL with an optional lossless title prefilter; params: [targetNodeId, needle?]. */
export function nodeBacklinkSourcesQuery(targetNodeId: string, targetTitle: string) {
  const needle = nodeBacklinkCaselessNeedle(targetTitle);
  if (!needle) return { sql: NODE_BACKLINK_SOURCES_SQL, params: [targetNodeId] };
  return {
    sql: NODE_BACKLINK_SOURCES_SQL.replace('ORDER BY rowid', 'AND instr(content, ?) > 0\n     ORDER BY rowid'),
    params: [targetNodeId, needle]
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
  return collectNodeBacklinkRecords(
    targetNode,
    driver.queryAll<BacklinkSourceRow>(NODE_BACKLINK_SOURCES_SQL, [targetNodeId])
  );
}
