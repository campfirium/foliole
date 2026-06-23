import { ensureInboxNodeInSnapshot, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { browserLocalWorkspaceReviewPersistence } from '../store/workspaceReviewPersistence';
import {
  createInitialWorkspaceState,
  useWorkspaceStore,
  WORKSPACE_STORAGE_KEY,
  type WorkspacePersistedState
} from '../store/workspaceStore';
import { createWorkspaceReviewActions } from '../store/workspaceStoreReviewActions';

import { DEFAULT_DEMO_TOPIC, DEMO_TOPICS, getDemoTopicsForLocale, getDemoTopicNodeId, type DemoTopic } from './demoContent';
import {
  createDemoGuidesNode,
  DEMO_GUIDES_NODE_ID,
  getDemoGuidesRequiredNodeIds,
  moveDemoGuidesBeforeInbox
} from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import type { DemoPackReviewItem, DemoPackReviewScheduleSeed } from './demoPack';
import { isLocaleDemoPath, resolveDemoLocalePathSegment, resolveGuideSlugFromPath } from './demoRoutes';
import { createDemoReviewSession } from './demoWorkspaceSession';
import { repairDemoWorkspacePayload } from './demoWorkspaceSnapshotRepair';

export function resolveDemoTopicFromPath(pathname: string, topics: DemoTopic[] = DEMO_TOPICS) {
  const slug = resolveDemoSlugFromPath(pathname);
  return requireDemoTopic(
    topics.find((topic) => topic.slug === slug) ?? topics[0] ?? DEFAULT_DEMO_TOPIC
  );
}

function resolveDemoSlugFromPath(pathname: string) {
  if (isLocaleDemoPath(pathname)) return DEFAULT_DEMO_TOPIC?.slug;
  return resolveGuideSlugFromPath(pathname);
}

export function createDemoWorkspaceSnapshot(pathname: string, now = new Date()): WorkspacePersistedState {
  const initial = createInitialWorkspaceState(now);
  const timestamp = now.toISOString();
  const topics = getDemoTopicsForLocale(resolveDemoLocalePathSegment(pathname));
  const activeTopic = resolveDemoTopicFromPath(pathname, topics);
  const demoTopicNodes = createDemoTopicNodes(now, topics);
  const officialNodes = demoTopicNodes;
  const guideChildNodeIds = topics.filter((topic) => topic.parentId === null).map((topic) => getDemoTopicNodeId(topic));
  const allNodes = [createDemoGuidesNode(guideChildNodeIds, timestamp), ...officialNodes];
  const activeNodeId = getDemoTopicNodeId(activeTopic);
  const snapshot = moveDemoGuidesBeforeInbox(ensureInboxNodeInSnapshot({
    activeNodeId,
    layout: initial.layout,
    nodeViewById: { [activeNodeId]: { scrollTop: 0, selection: null, updatedAt: timestamp } },
    nodeOrder: allNodes.map((node) => node.id),
    nodesById: Object.fromEntries(allNodes.map((node) => [node.id, node])),
    rendererBoundaryKeepNodeIds: officialNodes.map((node) => node.id),
    reviewSession: createDemoReviewSession(activeNodeId, timestamp),
    trashedNodeDeletedAtById: {},
    trashedNodeIds: [],
    untitledSequenceByParent: {},
    capturedWorkspaceVersion: DEMO_CAPTURED_VERSION
  }));
  return snapshot;
}

function createDemoTopicNodes(now: Date, topics: DemoTopic[] = DEMO_TOPICS) {
  const timestamp = now.toISOString();
  return topics.flatMap((topic) => {
    const topicNodeId = getDemoTopicNodeId(topic);
    const childTopicNodeIds = topic.childTopicIds.map((topicId) => `demo-${topicId}`);
    const itemNodes = topic.reviewItems.map((item) => createDemoReviewItemNode(item, topicNodeId, topic, now));
    return [
      {
        id: topicNodeId,
        parentNodeId: topic.parentId ? `demo-${topic.parentId}` : DEMO_GUIDES_NODE_ID,
        kind: 'topic' as const,
        title: topic.title,
        isTitleManual: true,
        manualChildOrder: [...childTopicNodeIds, ...itemNodes.map((node) => node.id)],
        content: renderDemoTopicMarkdown(topic),
        openingText: topic.summary,
        reveal: null,
        review: null,
        reading: {
          intervalDurationMs: topic.readingSeed.intervalDurationMs,
          intervalGrowthFactor: topic.readingSeed.intervalGrowthFactor,
          lastHandledAt: resolveDemoRelativeTime(now, topic.readingSeed.lastHandledAt.dayOffset),
          nextAt: resolveDemoRelativeTime(now, topic.readingSeed.nextAt.dayOffset),
          priority: topic.readingSeed.priority,
          readingPosition: topic.readingSeed.readingPosition,
          repetitionCount: topic.readingSeed.repetitionCount,
          state: topic.readingSeed.state
        },
        bodyStatus: 'ready' as const,
        hasContent: true,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      ...itemNodes
    ];
  });
}

function createDemoReviewItemNode(item: DemoPackReviewItem, parentNodeId: string, topic: DemoTopic, now: Date) {
  const timestamp = now.toISOString();
  const schedule = requireDemoReviewSchedule(topic, item.id);
  return {
    id: `demo-${item.id}`,
    parentNodeId,
    kind: 'item' as const,
    title: item.title,
    isTitleManual: true,
    content: item.prompt,
    openingText: item.prompt,
    reveal: item.answer,
    review: {
      due: resolveDemoRelativeTime(now, schedule.due.dayOffset),
      lastReviewAt: schedule.lastReviewAt ? resolveDemoRelativeTime(now, schedule.lastReviewAt.dayOffset) : null,
      state: schedule.state,
      stability: schedule.stability,
      difficulty: schedule.difficulty,
      elapsedDays: schedule.elapsedDays,
      scheduledDays: schedule.scheduledDays,
      reps: schedule.reps,
      lapses: schedule.lapses
    },
    reading: null,
    bodyStatus: 'ready' as const,
    hasContent: true,
    hasReveal: item.answer !== null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function renderDemoTopicMarkdown(topic: DemoTopic) {
  return [
    `# ${topic.title}`,
    ...topic.blocks.map((block) => {
      if (block.kind === 'heading') return `## ${block.text}`;
      return block.text;
    })
  ].join('\n\n');
}

function requireDemoReviewSchedule(topic: DemoTopic, reviewItemId: string): DemoPackReviewScheduleSeed {
  const schedule = topic.reviewScheduleSeeds.find((seed) => seed.reviewItemId === reviewItemId);
  if (!schedule) {
    throw new Error(`Demo topic is missing review schedule seed: ${reviewItemId}`);
  }
  return schedule;
}

function resolveDemoRelativeTime(now: Date, dayOffset: number) {
  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString();
}

export async function installDemoWorkspaceSnapshot(pathname = window.location.pathname) {
  const rawPayload = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (rawPayload) {
    const repairedPayload = repairDemoWorkspacePayload(rawPayload, pathname);
    if (repairedPayload) {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, repairedPayload);
    }
  }
  if (!hasCompatibleDemoWorkspacePayload(pathname)) {
    const snapshot = createDemoWorkspaceSnapshot(pathname);
    window.localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({ state: snapshot, version: 0 })
    );
    window.localStorage.setItem(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  }
  await useWorkspaceStore.persist.rehydrate();
  installDemoBrowserLocalReviewActions();
}

function installDemoBrowserLocalReviewActions() {
  useWorkspaceStore.setState(createWorkspaceReviewActions(
    useWorkspaceStore.setState,
    useWorkspaceStore.getState,
    undefined,
    browserLocalWorkspaceReviewPersistence,
    { startReviewSession: { includeScheduledFallback: true } }
  ));
}

function hasCompatibleDemoWorkspacePayload(pathname: string) {
  const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  const marker = window.localStorage.getItem(DEMO_SNAPSHOT_VERSION);
  if (!raw || marker !== DEMO_CAPTURED_VERSION) return false;
  try {
    const payload = JSON.parse(raw) as { state?: Partial<WorkspacePersistedState>; version?: number };
    return payload.version === 0 && isCompatibleDemoWorkspaceState(payload.state, pathname);
  } catch {
    return false;
  }
}

function isCompatibleDemoWorkspaceState(state: Partial<WorkspacePersistedState> | undefined, pathname: string) {
  if (!state || state.capturedWorkspaceVersion !== DEMO_CAPTURED_VERSION) return false;
  if (!state.nodesById || !state.nodeOrder || !state.reviewSession) return false;
  if (state.activeNodeId !== null && state.activeNodeId !== undefined && !state.nodesById[state.activeNodeId]) {
    return false;
  }
  const topics = getDemoTopicsForLocale(resolveDemoLocalePathSegment(pathname));
  return Boolean(
    state.nodeOrder.includes(INBOX_NODE_ID) &&
    isDemoGuidesOrderedBeforeInbox(state.nodeOrder) &&
    getDemoGuidesRequiredNodeIds(pathname).every((nodeId) => state.nodesById?.[nodeId]) &&
    topics.every((topic) => state.nodesById?.[getDemoTopicNodeId(topic)]?.title === topic.title)
  );
}

function isDemoGuidesOrderedBeforeInbox(nodeOrder: readonly string[]) {
  const guidesIndex = nodeOrder.indexOf('demo-guides');
  const inboxIndex = nodeOrder.indexOf(INBOX_NODE_ID);
  return guidesIndex >= 0 && inboxIndex >= 0 && guidesIndex < inboxIndex;
}

function requireDemoTopic(topic: DemoTopic | undefined) {
  if (!topic) {
    throw new Error('Demo requires at least one topic.');
  }
  return topic;
}
