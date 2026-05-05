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

function loadTargetNode(driver: DatabaseDriver, nodeId: string) {
  return driver.queryOne<TargetNodeRow>(
    `SELECT id, title
     FROM nodes
     WHERE id = ?
       AND deleted_at IS NULL`,
    [nodeId]
  );
}

function loadBacklinkSources(driver: DatabaseDriver, targetNodeId: string) {
  return driver.queryAll<BacklinkSourceRow>(
    `SELECT id, title, content
     FROM nodes
     WHERE id != ?
       AND deleted_at IS NULL`,
    [targetNodeId]
  );
}

export function loadNodeBacklinks(driver: DatabaseDriver, targetNodeId: string): NodeBacklinkRecord[] {
  const targetNode = loadTargetNode(driver, targetNodeId);
  const normalizedTargetTitle = normalizeTitle(targetNode?.title ?? '');
  if (!targetNode || !normalizedTargetTitle) {
    return [];
  }

  return loadBacklinkSources(driver, targetNodeId).flatMap((node) => {
    const matchOffsets = collectMatchingLinkOffsets(node.content, normalizedTargetTitle);
    if (matchOffsets.length === 0) {
      return [];
    }
    return [{
      source_node_id: node.id,
      source_title: node.title.trim() || 'Untitled',
      context: buildBacklinkContext(node.content, matchOffsets[0]) || node.title.trim() || 'Untitled',
      match_count: matchOffsets.length
    }];
  });
}
