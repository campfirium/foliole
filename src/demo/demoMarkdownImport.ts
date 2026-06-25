import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import type { ReviewSessionState, WorkspacePersistedState } from '../store/workspaceStore';

import {
  appendManualChildOrder,
  buildImportNodes,
  isHiddenPath,
  isSupportedDemoImportFileName,
  normalizeRelativePath
} from './demoMarkdownImportBuild';

export interface DemoMarkdownImportEntry {
  markdown: string;
  relativePath?: string;
  sourceName?: string;
}

export interface DemoMarkdownImportResult {
  importedTopicIds: string[];
  ignoredCount: number;
  state: WorkspacePersistedState;
}

export function createDemoMarkdownPasteEntry(markdown: string): DemoMarkdownImportEntry | null {
  const trimmed = markdown.trim();
  if (!trimmed) return null;
  return { markdown: trimmed, sourceName: 'Pasted Markdown' };
}

export function createDemoMarkdownFileEntry(args: {
  markdown: string;
  name: string;
  relativePath?: string;
}): DemoMarkdownImportEntry | null {
  const path = normalizeRelativePath(args.relativePath ?? args.name);
  if (isHiddenPath(path) || (!isSupportedDemoImportFileName(args.name) && !isSupportedDemoImportFileName(path))) {
    return null;
  }
  const trimmed = args.markdown.trim();
  if (!trimmed) return null;
  return {
    markdown: trimmed,
    relativePath: path,
    sourceName: args.name
  };
}

export function applyDemoMarkdownImport(
  state: WorkspacePersistedState,
  entries: DemoMarkdownImportEntry[],
  nowIso: string
): DemoMarkdownImportResult {
  const buildResult = buildImportNodes(state, entries, nowIso);
  if (buildResult.topicNodeIds.length === 0) {
    return { ignoredCount: buildResult.ignoredCount, importedTopicIds: [], state };
  }
  const nodesById = { ...state.nodesById };
  buildResult.nodes.forEach((node) => {
    nodesById[node.id] = node;
  });
  nodesById[INBOX_NODE_ID] = appendManualChildOrder(nodesById[INBOX_NODE_ID], buildResult.rootNodeId, nowIso);
  const importedNodeIds = buildResult.nodes.map((node) => node.id);
  const firstTopicId = buildResult.topicNodeIds[0]!;
  return {
    ignoredCount: buildResult.ignoredCount,
    importedTopicIds: buildResult.topicNodeIds,
    state: {
      ...state,
      activeNodeId: firstTopicId,
      nodeOrder: [...state.nodeOrder, ...importedNodeIds],
      nodesById,
      nodeViewById: {
        ...state.nodeViewById,
        [firstTopicId]: { scrollTop: 0, selection: null, updatedAt: nowIso }
      },
      rendererBoundaryKeepNodeIds: [
        ...new Set([...(state.rendererBoundaryKeepNodeIds ?? []), ...importedNodeIds])
      ],
      reviewSession: mergeReviewSession(state.reviewSession, buildResult.topicNodeIds, firstTopicId, nowIso)
    }
  };
}

function mergeReviewSession(
  session: ReviewSessionState,
  topicNodeIds: string[],
  firstTopicId: string,
  nowIso: string
): ReviewSessionState {
  const queueNodeIds = [...new Set([firstTopicId, ...topicNodeIds, ...session.queueNodeIds])];
  return {
    ...session,
    currentItemStartedAt: nowIso,
    currentNodeId: firstTopicId,
    isAnswerRevealed: false,
    queueNodeIds,
    sessionStartedAt: session.sessionStartedAt ?? nowIso,
    totalNodeCount: queueNodeIds.length
  };
}
