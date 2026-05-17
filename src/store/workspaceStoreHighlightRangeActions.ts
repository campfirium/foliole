import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { isTextAnchorLocator, type Node, type TextAnchorLocator } from '../features/nodes/model/nodeTypes';
import { loadWorkspaceNodeDocumentFromRuntime } from '../shared/platform/workspaceRuntimeDocumentRepository';

import {
  readCachedWorkspaceNodeDocument,
  syncWorkspaceNodeDocumentCacheFromNode,
  writeCachedWorkspaceNodeDocument
} from './workspaceNodeDocumentCache';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export interface HighlightRangeUpdate {
  from: number;
  to: number;
}

function isValidRange(range: HighlightRangeUpdate, contentLength: number) {
  return (
    Number.isInteger(range.from) &&
    Number.isInteger(range.to) &&
    range.from >= 0 &&
    range.to > range.from &&
    range.to <= contentLength
  );
}

function splitHighlightNoteSuffix(content: string) {
  const noteIndex = content.search(/\n※ /u);
  return noteIndex === -1
    ? { body: content, suffix: '' }
    : { body: content.slice(0, noteIndex), suffix: content.slice(noteIndex) };
}

function getMarkdownLinePrefix(line: string) {
  return line.match(/^(\s*(?:(?:>\s*)+)?(?:(?:[-*+]\s+)|(?:\d+\.\s+)|(?:#{1,6}\s+))?)/u)?.[1] ?? '';
}

function resolveProjectedHighlightBody(body: string, previousText: string, nextText: string) {
  const lines = body.split('\n');
  const contentLines = lines.filter((line) => line.trim().length > 0);
  const [line] = contentLines;
  if (contentLines.length !== 1 || !line || deriveNodeTitleFromContent(line) !== previousText) {
    return null;
  }
  const lineIndex = lines.indexOf(line);
  lines[lineIndex] = `${getMarkdownLinePrefix(line)}${nextText}`;
  return lines.join('\n');
}

function resolveSyncedHighlightContent(currentContent: string, previousText: string, nextText: string) {
  const { body, suffix } = splitHighlightNoteSuffix(currentContent);
  const projectedText = deriveNodeTitleFromContent(body);
  const sourceTexts = Array.from(new Set(
    [previousText, nextText.startsWith(projectedText) ? projectedText : ''].filter((text) => text.length > 0)
  ));
  for (const sourceText of sourceTexts) {
    if (body === sourceText) {
      return `${nextText}${suffix}`;
    }
    const projectedBody = resolveProjectedHighlightBody(body, sourceText, nextText);
    if (projectedBody !== null) {
      return `${projectedBody}${suffix}`;
    }
    if (body.startsWith(sourceText)) {
      const bodySuffix = body.slice(sourceText.length);
      if (bodySuffix === '' || bodySuffix.startsWith('\n')) {
        return `${nextText}${bodySuffix}${suffix}`;
      }
    }
  }
  return null;
}

function mergeCachedDocumentIfNeeded(node: Node) {
  if (isNodeDocumentLoaded(node)) {
    return node;
  }
  const cachedDocument = readCachedWorkspaceNodeDocument(node.id);
  return cachedDocument ? mergeWorkspaceNodeDocument(node, cachedDocument) : node;
}

function buildUpdatedHighlightNode(args: {
  node: Node;
  parentContent: string;
  range: HighlightRangeUpdate;
  timestamp: string;
}) {
  if (args.node.anchorLink?.kind !== 'highlight' || !isTextAnchorLocator(args.node.anchorLink.locator)) {
    return null;
  }
  if (!isValidRange(args.range, args.parentContent.length)) {
    return null;
  }
  const locator: TextAnchorLocator = {
    from: args.range.from,
    originalText: args.parentContent.slice(args.range.from, args.range.to),
    to: args.range.to
  };
  const previousLocator = args.node.anchorLink.locator;
  const syncedContent = resolveSyncedHighlightContent(args.node.content, previousLocator.originalText, locator.originalText);
  const shouldSyncTitle = !args.node.isTitleManual && args.node.title === previousLocator.originalText;
  return {
    ...args.node,
    anchorLink: {
      ...args.node.anchorLink,
      locator
    },
    ...(syncedContent !== null ? { content: syncedContent } : {}),
    ...(shouldSyncTitle ? { title: locator.originalText } : {}),
    updatedAt: args.timestamp
  } satisfies Node;
}

async function syncUnloadedHighlightContent(args: {
  nextNode: Node;
  previousText: string;
  set: WorkspaceSet;
}) {
  const document = await loadWorkspaceNodeDocumentFromRuntime(args.nextNode.id).catch(() => null);
  if (!document) {
    return;
  }
  const locator = args.nextNode.anchorLink?.locator;
  if (!isTextAnchorLocator(locator)) {
    return;
  }
  const syncedContent = resolveSyncedHighlightContent(document.content, args.previousText, locator.originalText);
  if (syncedContent === null) {
    syncNodeContentToRuntime(mergeWorkspaceNodeDocument(args.nextNode, document));
    return;
  }
  const nextDocument = { ...document, content: syncedContent };
  const hydratedNode = mergeWorkspaceNodeDocument(args.nextNode, nextDocument);
  writeCachedWorkspaceNodeDocument(args.nextNode.id, nextDocument);
  args.set((state) => {
    const currentNode = state.nodesById[args.nextNode.id];
    if (!currentNode || currentNode.updatedAt !== args.nextNode.updatedAt) {
      return state;
    }
    return {
      nodesById: {
        ...state.nodesById,
        [args.nextNode.id]: hydratedNode
      }
    };
  });
  syncNodeContentToRuntime(hydratedNode);
}

export function createUpdateHighlightAnchorRangeAction(set: WorkspaceSet) {
  return (highlightNodeId: string, range: HighlightRangeUpdate) => {
    let nextNodeForSync: Node | null = null;
    let previousTextForUnloadedSync: string | null = null;
    set((state) => {
      const node = state.nodesById[highlightNodeId];
      if (!node || state.trashedNodeIds.includes(highlightNodeId)) {
        return state;
      }
      const parentNode = node.parentNodeId ? state.nodesById[node.parentNodeId] : null;
      if (!parentNode) {
        return state;
      }
      const documentNode = mergeCachedDocumentIfNeeded(node);
      const nextNode = buildUpdatedHighlightNode({
        node: documentNode,
        parentContent: parentNode.content,
        range,
        timestamp: new Date().toISOString()
      });
      if (!nextNode) {
        return state;
      }
      nextNodeForSync = nextNode;
      if (!isNodeDocumentLoaded(documentNode)) {
        previousTextForUnloadedSync = node.anchorLink?.locator && isTextAnchorLocator(node.anchorLink.locator)
          ? node.anchorLink.locator.originalText
          : null;
      }
      return {
        nodesById: {
          ...state.nodesById,
          [highlightNodeId]: nextNode
        }
      };
    });
    if (!nextNodeForSync) {
      return false;
    }
    if (previousTextForUnloadedSync) {
      void syncUnloadedHighlightContent({ nextNode: nextNodeForSync, previousText: previousTextForUnloadedSync, set });
    } else {
      syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return true;
  };
}
