import type { Node } from '../features/nodes/model/nodeTypes';
import { ensureInboxNodeInSnapshot, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { toNodeReviewProfile } from '../features/review/model/reviewTypes';
import { browserLocalWorkspaceReviewPersistence } from '../store/workspaceReviewPersistence';
import {
  createInitialWorkspaceState,
  useWorkspaceStore,
  WORKSPACE_STORAGE_KEY,
  type ReviewSessionState,
  type WorkspacePersistedState
} from '../store/workspaceStore';
import { createWorkspaceReviewActions } from '../store/workspaceStoreReviewActions';

import { DEFAULT_DEMO_TOPIC, DEMO_TOPICS, type DemoTopic } from './demoContent';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import type { DemoPackReadingSeed, DemoPackReviewItem, DemoPackReviewScheduleSeed, DemoPackRelativeTime } from './demoPack';
import { repairDemoWorkspacePayload } from './demoWorkspaceSnapshotRepair';

export function resolveDemoTopicFromPath(pathname: string, topics: DemoTopic[] = DEMO_TOPICS) {
  const slug = resolveDemoSlugFromPath(pathname);
  return requireDemoTopic(
    topics.find((topic) => topic.slug === slug) ?? topics[0] ?? DEFAULT_DEMO_TOPIC
  );
}

function resolveDemoSlugFromPath(pathname: string) {
  if (pathname === '/demo/') return DEFAULT_DEMO_TOPIC?.slug;
  return /^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?demo\/([^/]+)\/?$/i.exec(pathname)?.[1];
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
    browserLocalWorkspaceReviewPersistence
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
  const activeNodeId = toDemoNodeId(resolveDemoTopicFromPath(pathname));
  if (state.activeNodeId !== null && state.activeNodeId !== undefined && !state.nodesById[state.activeNodeId]) {
    return false;
  }
  return Boolean(
    state.nodesById[activeNodeId] &&
    state.nodeOrder.includes(INBOX_NODE_ID) &&
    getRequiredDemoNodeIds().every((nodeId) => state.nodesById?.[nodeId])
  );
}

function getRequiredDemoNodeIds() {
  return DEMO_TOPICS.flatMap((topic) => [
    toDemoNodeId(topic),
    ...topic.reviewItems.map((item) => toDemoReviewItemNodeId(topic, item))
  ]);
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
