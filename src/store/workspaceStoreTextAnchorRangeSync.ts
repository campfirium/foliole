import {
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import { isTextAnchorLocator, type Node, type TextAnchorLocator } from '../features/nodes/model/nodeTypes';
import { loadWorkspaceNodeDocumentFromRuntime } from '../shared/platform/workspaceRuntimeDocumentRepository';

import { writeCachedWorkspaceNodeDocument } from './workspaceNodeDocumentCache';
import { mergeWorkspaceNodeDocument, type WorkspaceNodeDocument } from './workspaceRendererBoundary';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { buildUpdatedClozeFields } from './workspaceStoreClozeRangePromptSync';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export interface TextAnchorRangeUpdate {
  from: number;
  to: number;
}

function isValidRange(range: TextAnchorRangeUpdate, contentLength: number) {
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

function buildUpdatedHighlightFields(args: {
  locator: TextAnchorLocator;
  node: Node;
  previousLocator: TextAnchorLocator;
}) {
  const syncedContent = resolveSyncedHighlightContent(
    args.node.content,
    args.previousLocator.originalText,
    args.locator.originalText
  );
  const shouldSyncTitle = !args.node.isTitleManual && args.node.title === args.previousLocator.originalText;
  return {
    ...(syncedContent !== null ? { content: syncedContent } : {}),
    ...(shouldSyncTitle ? { title: args.locator.originalText } : {})
  };
}

export function buildUpdatedTextAnchorNode(args: {
  node: Node;
  parentContent: string;
  range: TextAnchorRangeUpdate;
  timestamp: string;
}) {
  const anchorLink = args.node.anchorLink;
  if ((anchorLink?.kind !== 'highlight' && anchorLink?.kind !== 'cloze') || !isTextAnchorLocator(anchorLink.locator)) {
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
  const previousLocator = anchorLink.locator;
  const syncedFields = anchorLink.kind === 'highlight'
    ? buildUpdatedHighlightFields({ locator, node: args.node, previousLocator })
    : buildUpdatedClozeFields({ locator, node: args.node, parentContent: args.parentContent, previousLocator });
  return {
    ...args.node,
    anchorLink: {
      ...anchorLink,
      locator
    },
    ...syncedFields,
    updatedAt: args.timestamp
  } satisfies Node;
}

function resolveSyncedUnloadedTextAnchorDocument(args: {
  document: WorkspaceNodeDocument;
  nextNode: Node;
  parentContent: string;
  previousLocator: TextAnchorLocator;
}) {
  const locator = args.nextNode.anchorLink?.locator;
  if (!isTextAnchorLocator(locator)) {
    return null;
  }
  if (args.nextNode.anchorLink?.kind === 'highlight') {
    const content = resolveSyncedHighlightContent(
      args.document.content,
      args.previousLocator.originalText,
      locator.originalText
    );
    return content === null ? null : { ...args.document, content };
  }
  const syncedFields = buildUpdatedClozeFields({
    locator,
    node: { ...args.nextNode, content: args.document.content, reveal: args.document.reveal },
    parentContent: args.parentContent,
    previousLocator: args.previousLocator
  });
  const hasDocumentChange = 'content' in syncedFields || 'reveal' in syncedFields;
  if (!hasDocumentChange) {
    return null;
  }
  return {
    ...args.document,
    ...('content' in syncedFields ? { content: syncedFields.content } : {}),
    ...('reveal' in syncedFields ? { reveal: syncedFields.reveal } : {})
  };
}

export async function syncUnloadedTextAnchorContent(args: {
  nextNode: Node;
  parentContent: string;
  previousLocator: TextAnchorLocator;
  set: WorkspaceSet;
}) {
  const document = await loadWorkspaceNodeDocumentFromRuntime(args.nextNode.id).catch(() => null);
  if (!document) {
    return;
  }
  const nextDocument = resolveSyncedUnloadedTextAnchorDocument({
    document,
    nextNode: args.nextNode,
    parentContent: args.parentContent,
    previousLocator: args.previousLocator
  });
  if (nextDocument === null) {
    syncNodeContentToRuntime(mergeWorkspaceNodeDocument(args.nextNode, document));
    return;
  }
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
