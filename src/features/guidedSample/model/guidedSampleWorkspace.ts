import type { WorkspaceState } from '../../../store/workspaceStore';
import { deriveNodeTitleFromContent } from '../../nodes/model/deriveNodeTitle';
import { INBOX_NODE_ID } from '../../nodes/model/specialNodes';

import { importGuidedSampleTopicAssets } from './guidedSampleAssetImports';
import {
  getGuidedSampleContent,
  getGuidedSampleRootTitles,
  GUIDED_SAMPLE_MARKER,
  type GuidedSampleTopicTemplate
} from './guidedSampleContent';
import { resolveGuidedSampleLocale, type GuidedSampleLocale } from './guidedSampleLocale';

const GUIDED_SAMPLE_PRIORITY = 0;

export interface GuidedSampleCreationResult {
  locale: GuidedSampleLocale;
  queueNodeIds: string[];
  rootNodeId: string | null;
  wasCreated: boolean;
  wasWorkspaceEmpty: boolean;
}

export interface GuidedSampleCreationOptions {
  onAssetImportError?: (error: unknown) => void;
  refreshWorkspaceState?: () => Promise<void> | void;
}

type GuidedSampleWorkspaceState = Pick<
  WorkspaceState,
  | 'activeNodeId'
  | 'createChildNode'
  | 'createRootNode'
  | 'nodesById'
  | 'nodeOrder'
  | 'trashedNodeIds'
>;

function isVisibleUserTopic(state: GuidedSampleWorkspaceState, nodeId: string) {
  const node = state.nodesById[nodeId];
  return Boolean(node && !node.specialKind && !state.trashedNodeIds.includes(nodeId));
}

async function importTopicAssets(
  nodeId: string,
  topic: GuidedSampleTopicTemplate,
  options: GuidedSampleCreationOptions
) {
  try {
    await importGuidedSampleTopicAssets(nodeId, topic);
  } catch (error) {
    options.onAssetImportError?.(error);
  }
}

export function isWorkspaceEmptyForGuidedSample(state: GuidedSampleWorkspaceState) {
  return !state.nodeOrder.some((nodeId) => isVisibleUserTopic(state, nodeId));
}

export function findGuidedSampleRootNodeId(state: GuidedSampleWorkspaceState) {
  const guidedSampleRootTitles = getGuidedSampleRootTitles();
  return state.nodeOrder.find((nodeId) => {
    const node = state.nodesById[nodeId];
    return Boolean(
      node &&
        !node.specialKind &&
        node.parentNodeId === INBOX_NODE_ID &&
        !state.trashedNodeIds.includes(nodeId) &&
        (node.content.includes(GUIDED_SAMPLE_MARKER) || guidedSampleRootTitles.has(node.title))
    );
  }) ?? null;
}

function findChildTopicByTitle(state: GuidedSampleWorkspaceState, parentNodeId: string, title: string) {
  return state.nodeOrder.find((nodeId) => {
    const node = state.nodesById[nodeId];
    return Boolean(
      node &&
        !node.specialKind &&
        node.parentNodeId === parentNodeId &&
        !state.trashedNodeIds.includes(nodeId) &&
        node.title === title
    );
  }) ?? null;
}

function collectGuidedSampleQueueNodeIds(state: GuidedSampleWorkspaceState, rootNodeId: string) {
  return [
    rootNodeId,
    ...state.nodeOrder.filter((nodeId) => {
      const node = state.nodesById[nodeId];
      return Boolean(node && node.parentNodeId === rootNodeId && !state.trashedNodeIds.includes(nodeId));
    })
  ];
}

async function refreshCreatedRootNodeId(
  rootNodeId: string | null,
  getState: () => GuidedSampleWorkspaceState,
  options: GuidedSampleCreationOptions
) {
  if (rootNodeId && getState().nodesById[rootNodeId]) {
    return rootNodeId;
  }
  await options.refreshWorkspaceState?.();
  return rootNodeId && getState().nodesById[rootNodeId]
    ? rootNodeId
    : findGuidedSampleRootNodeId(getState());
}

async function refreshCreatedChildNodeId(
  childNodeId: string | null,
  childTopic: GuidedSampleTopicTemplate,
  getState: () => GuidedSampleWorkspaceState,
  options: GuidedSampleCreationOptions,
  rootNodeId: string
) {
  if (childNodeId && getState().nodesById[childNodeId]) {
    return childNodeId;
  }
  await options.refreshWorkspaceState?.();
  const childTitle = deriveNodeTitleFromContent(childTopic.content);
  return childNodeId && getState().nodesById[childNodeId]
    ? childNodeId
    : findChildTopicByTitle(getState(), rootNodeId, childTitle);
}

export async function ensureGuidedSampleTopicTree(
  getState: () => GuidedSampleWorkspaceState,
  requestedLocale?: GuidedSampleLocale,
  options: GuidedSampleCreationOptions = {}
): Promise<GuidedSampleCreationResult> {
  const beforeState = getState();
  const wasWorkspaceEmpty = isWorkspaceEmptyForGuidedSample(beforeState);
  const existingRootNodeId = findGuidedSampleRootNodeId(beforeState);
  const preferredLocale = resolveGuidedSampleLocale(requestedLocale);
  const locale = preferredLocale;
  if (existingRootNodeId) {
    return {
      locale,
      queueNodeIds: collectGuidedSampleQueueNodeIds(beforeState, existingRootNodeId),
      rootNodeId: existingRootNodeId,
      wasCreated: false,
      wasWorkspaceEmpty
    };
  }
  const content = getGuidedSampleContent(locale);
  const createdRootNodeId = await beforeState.createRootNode(content.root.content, 'topic', {
    priority: GUIDED_SAMPLE_PRIORITY
  });
  const rootNodeId = await refreshCreatedRootNodeId(createdRootNodeId, getState, options);
  if (!rootNodeId) {
    return { locale, queueNodeIds: [], rootNodeId: null, wasCreated: false, wasWorkspaceEmpty };
  }

  const topicAssets = [{ nodeId: rootNodeId, topic: content.root }];
  for (const childTopic of content.children) {
    const createdChildNodeId = await getState().createChildNode(rootNodeId, childTopic.content, 'topic', {
      priority: GUIDED_SAMPLE_PRIORITY
    });
    const childNodeId = await refreshCreatedChildNodeId(
      createdChildNodeId,
      childTopic,
      getState,
      options,
      rootNodeId
    );
    if (childNodeId) {
      topicAssets.push({ nodeId: childNodeId, topic: childTopic });
    }
  }
  for (const assetImport of topicAssets) {
    await importTopicAssets(assetImport.nodeId, assetImport.topic, options);
  }
  return {
    locale,
    queueNodeIds: collectGuidedSampleQueueNodeIds(getState(), rootNodeId),
    rootNodeId,
    wasCreated: true,
    wasWorkspaceEmpty
  };
}
