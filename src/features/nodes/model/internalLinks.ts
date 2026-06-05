import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';

import type { Node } from './nodeTypes';

const WIKI_LINK_PATTERN = /(?<!!)\[\[([^\]\n]+)\]\]/g;

export interface WikiLinkMatch {
  from: number;
  to: number;
  title: string;
}

export interface BacklinkItem {
  sourceNodeId: string;
  sourceTitle: string;
  context: string;
  matchCount: number;
}

function normalizeTitle(value: string) {
  return value.trim().toLocaleLowerCase();
}

function untitledLabel() {
  return translate(getStoredAppLocale(), 'desktop.search.context.untitled');
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

export function collectWikiLinkMatches(content: string): WikiLinkMatch[] {
  const matches: WikiLinkMatch[] = [];
  let match = WIKI_LINK_PATTERN.exec(content);
  while (match) {
    const title = (match[1] ?? '').trim();
    if (title) {
      matches.push({
        from: match.index,
        to: match.index + (match[0]?.length ?? 0),
        title
      });
    }
    match = WIKI_LINK_PATTERN.exec(content);
  }
  WIKI_LINK_PATTERN.lastIndex = 0;
  return matches;
}

export function resolveInternalLinkTargetId(args: {
  title: string;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  const normalizedTitle = normalizeTitle(args.title);
  if (!normalizedTitle) {
    return null;
  }
  const trashedIds = new Set(args.trashedNodeIds);
  for (const nodeId of args.nodeOrder) {
    if (trashedIds.has(nodeId)) {
      continue;
    }
    const node = args.nodesById[nodeId];
    if (!node) {
      continue;
    }
    if (normalizeTitle(node.title) === normalizedTitle) {
      return node.id;
    }
  }
  return null;
}

export function collectBacklinks(args: {
  targetNodeId: string;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  const targetNode = args.nodesById[args.targetNodeId];
  const normalizedTargetTitle = normalizeTitle(targetNode?.title ?? '');
  if (!targetNode || !normalizedTargetTitle) {
    return [];
  }

  const backlinks: BacklinkItem[] = [];
  const trashedIds = new Set(args.trashedNodeIds);

  for (const nodeId of args.nodeOrder) {
    if (nodeId === args.targetNodeId || trashedIds.has(nodeId)) {
      continue;
    }
    const node = args.nodesById[nodeId];
    if (!node) {
      continue;
    }
    const matches = collectWikiLinkMatches(node.content);
    const matchedLinks = matches.filter((match) => normalizeTitle(match.title) === normalizedTargetTitle);
    if (matchedLinks.length === 0) {
      continue;
    }
    const firstMatch = matchedLinks[0];
    if (!firstMatch) {
      continue;
    }
    backlinks.push({
      sourceNodeId: node.id,
      sourceTitle: node.title.trim() || untitledLabel(),
      context: buildBacklinkContext(node.content, firstMatch.from) || node.title.trim() || untitledLabel(),
      matchCount: matchedLinks.length
    });
  }

  return backlinks;
}
