import { getGuidedSampleContent } from '../features/guidedSample/model/guidedSampleContent';
import type { GuidedSampleLocale } from '../features/guidedSample/model/guidedSampleLocale';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import { HOME_NODE_ID, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import type { WorkspacePersistedState } from '../store/workspaceStore';

import { resolveDemoLocalePathSegment } from './demoRoutes';

export const DEMO_GUIDES_NODE_ID = 'demo-guides';
export const DEMO_GUIDES_TITLE = 'Guides';
export const DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE = {
  'en-US': 'demo-guides-welcome-en',
  'zh-CN': 'demo-guides-welcome-zh-hans'
} as const satisfies Record<GuidedSampleLocale, string>;

export function resolveDemoGuideLocaleFromPath(pathname: string): GuidedSampleLocale {
  return resolveDemoLocalePathSegment(pathname) === 'zh-hans' ? 'zh-CN' : 'en-US';
}

export function getDemoGuidesRequiredNodeIds(pathname: string) {
  void pathname;
  return [DEMO_GUIDES_NODE_ID];
}

export function moveDemoGuidesBeforeInbox<T extends WorkspacePersistedState>(snapshot: T): T {
  return {
    ...snapshot,
    nodeOrder: [
      HOME_NODE_ID,
      DEMO_GUIDES_NODE_ID,
      INBOX_NODE_ID,
      ...snapshot.nodeOrder.filter((nodeId) => (
        nodeId !== HOME_NODE_ID &&
        nodeId !== DEMO_GUIDES_NODE_ID &&
        nodeId !== INBOX_NODE_ID
      ))
    ]
  };
}

export function createDemoGuidesNode(childNodeIds: string[], timestamp: string): Node {
  return {
    id: DEMO_GUIDES_NODE_ID,
    parentNodeId: null,
    kind: 'folder',
    title: DEMO_GUIDES_TITLE,
    isTitleManual: true,
    manualChildOrder: childNodeIds,
    content: '',
    openingText: null,
    reveal: null,
    review: null,
    reading: null,
    bodyStatus: 'empty',
    hasContent: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createDemoGuidesWelcomeNode(locale: GuidedSampleLocale, timestamp: string): Node {
  const content = getGuidedSampleContent(locale);
  const childNodeIds = getDemoGuidesWelcomeChildNodeIds(locale);
  return {
    id: DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE[locale],
    parentNodeId: DEMO_GUIDES_NODE_ID,
    kind: 'topic',
    title: content.rootTitle,
    isTitleManual: true,
    manualChildOrder: childNodeIds,
    content: content.root.content,
    openingText: content.rootTitle,
    reveal: null,
    review: null,
    reading: createInitialGuideReading(timestamp),
    bodyStatus: 'ready',
    hasContent: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createDemoGuidesWelcomeChildNodes(locale: GuidedSampleLocale, timestamp: string): Node[] {
  const rootNodeId = DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE[locale];
  return getGuidedSampleContent(locale).children.map((topic, index) => {
    const title = deriveNodeTitleFromContent(topic.content);
    return {
      id: getDemoGuidesWelcomeChildNodeId(locale, index),
      parentNodeId: rootNodeId,
      kind: 'topic',
      title,
      isTitleManual: true,
      manualChildOrder: [],
      content: topic.content,
      openingText: title,
      reveal: null,
      review: null,
      reading: createInitialGuideReading(timestamp),
      bodyStatus: 'ready',
      hasContent: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });
}

function createInitialGuideReading(timestamp: string): NodeReadingProfile {
  return {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: timestamp,
    nextAt: timestamp,
    priority: 0,
    readingPosition: 0,
    repetitionCount: 0,
    state: 'active'
  };
}

function getDemoGuidesWelcomeChildNodeIds(locale: GuidedSampleLocale) {
  return getGuidedSampleContent(locale).children.map((_, index) => getDemoGuidesWelcomeChildNodeId(locale, index));
}

function getDemoGuidesWelcomeChildNodeId(locale: GuidedSampleLocale, index: number) {
  return `${DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE[locale]}-child-${index + 1}`;
}
