import type { Node } from '../features/nodes/model/nodeTypes';
import { ensureInboxNodeInSnapshot, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { toNodeReviewProfile } from '../features/review/model/reviewTypes';
import {
  createInitialWorkspaceState,
  useWorkspaceStore,
  WORKSPACE_STORAGE_KEY,
  type ReviewSessionState,
  type WorkspacePersistedState
} from '../store/workspaceStore';

import { canonicalDemoPath, DEFAULT_DEMO_TOPIC, DEMO_TOPICS, type DemoTopic } from './demoContent';
import type { DemoPackReadingSeed, DemoPackReviewItem, DemoPackReviewScheduleSeed, DemoPackRelativeTime } from './demoPack';

const DEMO_SNAPSHOT_VERSION = 'demo-workspace-v1';
const DEMO_CAPTURED_VERSION = 'demo:2026-06-17';

export function resolveDemoTopicFromPath(pathname: string, topics: DemoTopic[] = DEMO_TOPICS) {
  return requireDemoTopic(
    topics.find((topic) => canonicalDemoPath(topic.slug) === pathname) ?? topics[0] ?? DEFAULT_DEMO_TOPIC
  );
}

export function createDemoWorkspaceSnapshot(pathname: string, now = new Date()): WorkspacePersistedState {
  const initial = createInitialWorkspaceState(now);
  const timestamp = now.toISOString();
  const topicNodes = DEMO_TOPICS.map((topic) => createTopicNode(topic, now, timestamp));
  const reviewNodes = DEMO_TOPICS.flatMap((topic) => createReviewItemNodes(topic, now, timestamp));
  const allNodes = [...topicNodes, ...reviewNodes];
  const activeTopic = resolveDemoTopicFromPath(pathname);
  const activeNodeId = toDemoNodeId(activeTopic);
  const snapshot = ensureInboxNodeInSnapshot({
    activeNodeId,
    layout: initial.layout,
    nodeViewById: { [activeNodeId]: { scrollTop: 0, selection: null, updatedAt: timestamp } },
    nodeOrder: [INBOX_NODE_ID, ...allNodes.map((node) => node.id)],
    nodesById: Object.fromEntries(allNodes.map((node) => [node.id, node])),
    rendererBoundaryKeepNodeIds: allNodes.map((node) => node.id),
    reviewSession: createDemoReviewSession(activeNodeId, topicNodes.map((node) => node.id), timestamp),
    trashedNodeDeletedAtById: {},
    trashedNodeIds: [],
    untitledSequenceByParent: {},
    capturedWorkspaceVersion: DEMO_CAPTURED_VERSION
  });
  return snapshot;
}

export function installDemoWorkspaceSnapshot(pathname = window.location.pathname) {
  const snapshot = createDemoWorkspaceSnapshot(pathname);
  window.localStorage.setItem(
    WORKSPACE_STORAGE_KEY,
    JSON.stringify({ state: snapshot, version: 0 })
  );
  window.localStorage.setItem(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  useWorkspaceStore.setState((state) => ({ ...state, ...snapshot }));
}

function createTopicNode(topic: DemoTopic, anchor: Date, timestamp: string): Node {
  const childNodeIds = topic.reviewItems.map((item) => toDemoReviewItemNodeId(topic, item));
  return {
    id: toDemoNodeId(topic),
    parentNodeId: INBOX_NODE_ID,
    kind: 'topic',
    title: topic.title,
    isTitleManual: true,
    manualChildOrder: childNodeIds,
    content: blocksToMarkdown(topic),
    openingText: topic.description,
    reveal: null,
    review: null,
    reading: createReadingProfile(topic.readingSeed, anchor),
    bodyStatus: 'ready',
    hasContent: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createReviewItemNodes(topic: DemoTopic, anchor: Date, timestamp: string): Node[] {
  const scheduleByItemId = new Map(topic.reviewScheduleSeeds.map((seed) => [seed.reviewItemId, seed]));
  return topic.reviewItems.map((item) => {
    const schedule = scheduleByItemId.get(item.id);
    if (!schedule) {
      throw new Error(`Demo review item is missing schedule seed: ${item.id}`);
    }
    return createReviewItemNode(topic, item, schedule, anchor, timestamp);
  });
}

function createReviewItemNode(
  topic: DemoTopic,
  item: DemoPackReviewItem,
  schedule: DemoPackReviewScheduleSeed,
  anchor: Date,
  timestamp: string
): Node {
  return {
    id: toDemoReviewItemNodeId(topic, item),
    parentNodeId: toDemoNodeId(topic),
    kind: 'item',
    title: item.title,
    isTitleManual: true,
    content: item.prompt,
    openingText: null,
    reveal: item.answer,
    anchorLink: item.kind === 'cloze' ? { id: item.id, kind: 'cloze' } : null,
    review: createReviewProfile(schedule, anchor),
    reading: null,
    bodyStatus: 'ready',
    hasContent: item.prompt.trim().length > 0,
    hasReveal: item.answer !== null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createReadingProfile(seed: DemoPackReadingSeed, anchor: Date): NonNullable<Node['reading']> {
  return {
    intervalDurationMs: seed.intervalDurationMs,
    intervalGrowthFactor: seed.intervalGrowthFactor,
    lastHandledAt: resolveRelativeTime(anchor, seed.lastHandledAt),
    nextAt: resolveRelativeTime(anchor, seed.nextAt),
    priority: seed.priority,
    readingPosition: seed.readingPosition,
    repetitionCount: seed.repetitionCount,
    state: seed.state
  };
}

function createReviewProfile(seed: DemoPackReviewScheduleSeed, anchor: Date): NonNullable<Node['review']> {
  return toNodeReviewProfile({
    due: resolveRelativeTime(anchor, seed.due),
    last_review: seed.lastReviewAt ? resolveRelativeTime(anchor, seed.lastReviewAt) : null,
    state: seed.state,
    stability: seed.stability,
    difficulty: seed.difficulty,
    elapsed_days: seed.elapsedDays,
    scheduled_days: seed.scheduledDays,
    reps: seed.reps,
    lapses: seed.lapses
  });
}

function createDemoReviewSession(activeNodeId: string, queueNodeIds: string[], timestamp: string): ReviewSessionState {
  return {
    currentNodeId: activeNodeId,
    currentItemStartedAt: timestamp,
    isAnswerRevealed: false,
    queueNodeIds: [activeNodeId, ...queueNodeIds.filter((nodeId) => nodeId !== activeNodeId)],
    sessionStartedAt: timestamp,
    totalNodeCount: queueNodeIds.length
  };
}

function blocksToMarkdown(topic: DemoTopic) {
  return topic.blocks.map((block) => (block.kind === 'heading' ? `## ${block.text}` : block.text)).join('\n\n');
}

function requireDemoTopic(topic: DemoTopic | undefined) {
  if (!topic) {
    throw new Error('Demo requires at least one topic.');
  }
  return topic;
}

function toDemoNodeId(topic: DemoTopic) {
  return `demo-${topic.slug}`;
}

function toDemoReviewItemNodeId(topic: DemoTopic, item: DemoPackReviewItem) {
  return `${toDemoNodeId(topic)}-review-${item.id}`;
}

function resolveRelativeTime(anchor: Date, value: DemoPackRelativeTime) {
  return new Date(anchor.getTime() + value.dayOffset * 24 * 60 * 60 * 1000).toISOString();
}
