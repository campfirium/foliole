import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';
import { installBrowserWorkspace } from '../store/installBrowserWorkspace';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';
import {
  createInitialWorkspaceState,
  useWorkspaceStore,
  type WorkspacePersistedState
} from '../store/workspaceStore';

import { DEFAULT_DEMO_TOPIC, DEMO_TOPICS, getDemoTopicsForLocale, getDemoTopicNodeId, type DemoTopic } from './demoContent';
import {
  createDemoGuidesNode,
  DEMO_GUIDES_NODE_ID,
  moveDemoGuidesBeforeInbox
} from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import type { DemoPackReviewItem, DemoPackReviewScheduleSeed } from './demoPack';
import { isLocaleDemoPath, resolveDemoLocalePathSegment, resolveGuideSlugFromPath } from './demoRoutes';
import { repairDemoWorkspaceState } from './demoWorkspaceSnapshotRepair';

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
    reviewSession: createEmptyReviewSession(),
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
  installBrowserWorkspace(useWorkspaceStore, window.localStorage, createDemoWorkspaceSnapshot(pathname), state => repairDemoWorkspaceState(state, pathname));
  window.localStorage.setItem(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
}

function requireDemoTopic(topic: DemoTopic | undefined) {
  if (!topic) {
    throw new Error('Demo requires at least one topic.');
  }
  return topic;
}
