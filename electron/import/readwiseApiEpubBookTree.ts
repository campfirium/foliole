import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import {
  stableReadwiseEpubNodeId,
  type PreparedReadwiseApiDocument
} from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';

interface BookNode {
  content: string;
  key: string;
  parentKey: string | null;
  title: string;
}

export function buildReadwiseApiEpubBookNodes(
  sections: NonNullable<PreparedReadwiseApiDocument['epubStructure']>['sections']
) {
  const parents: Array<string | null> = [];
  const stack: Array<{ key: string; level: number }> = [];
  for (const section of sections) {
    if (section.headingLevel === null) {
      stack.length = 0;
      parents.push(null);
      continue;
    }
    while (stack.length && stack[stack.length - 1]!.level >= section.headingLevel) stack.pop();
    parents.push(stack.at(-1)?.key ?? null);
    stack.push({ key: section.markerKey, level: section.headingLevel });
  }
  const parentKeys = new Set(parents.filter((key): key is string => Boolean(key)));
  return sections.flatMap((section, index): BookNode[] => {
    const parentKey = parents[index] ?? null;
    if (!parentKeys.has(section.markerKey)) {
      return [{ content: section.content, key: section.markerKey, parentKey, title: section.title }];
    }
    return [
      { content: `**${section.title}**`, key: section.markerKey, parentKey, title: section.title },
      {
        content: section.content,
        key: `${section.markerKey}:chapter-body`,
        parentKey: section.markerKey,
        title: stripChapterPrefix(section.title) || section.title
      }
    ];
  });
}

export function persistReadwiseApiEpubBookNodes(input: {
  connectionRef: string;
  documentId: string;
  importedAt: string;
  nodes: BookNode[];
  rootNodeId: string;
}) {
  const nodeIds = new Map<string, string>();
  input.nodes.forEach((node, index) => {
    const nodeId = stableReadwiseEpubNodeId(input.connectionRef, input.documentId, node.key);
    nodeIds.set(node.key, nodeId);
    upsertNodeSnapshot(openDatabaseConnection().driver, {
      anchorLink: null,
      content: node.content,
      createdAt: orderedTimestamp(input.importedAt, index),
      hideTitleHeading: false,
      isTitleManual: true,
      kind: 'topic',
      nodeId,
      parentNodeId: node.parentKey ? (nodeIds.get(node.parentKey) ?? input.rootNodeId) : input.rootNodeId,
      position: null,
      reveal: null,
      title: node.title,
      updatedAt: input.importedAt
    });
  });
}

function stripChapterPrefix(title: string) {
  return title
    .replace(/^\s*第\s*[零〇一二两三四五六七八九十百千万\d]+\s*[章节回部卷篇]\s*[:：、.\-)]?\s*/u, '')
    .replace(/^\s*chapter\s+(?:\d+|[ivxlcdm]+)\s*[:：.\-)]?\s*/iu, '')
    .trim();
}

function orderedTimestamp(timestamp: string, index: number) {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? new Date(value + index + 1).toISOString() : timestamp;
}
