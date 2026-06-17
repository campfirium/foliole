import type { Node } from '../features/nodes/model/nodeTypes';
import { ensureInboxNodeInSnapshot, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import {
  createInitialWorkspaceState,
  useWorkspaceStore,
  WORKSPACE_STORAGE_KEY,
  type ReviewSessionState,
  type WorkspacePersistedState
} from '../store/workspaceStore';

import { canonicalDemoPath, DEFAULT_DEMO_TOPIC, DEMO_TOPICS, type DemoTopic } from './demoContent';

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
  const topicNodes = DEMO_TOPICS.map((topic, index) => createTopicNode(topic, index, timestamp));
  const activeTopic = resolveDemoTopicFromPath(pathname);
  const activeNodeId = toDemoNodeId(activeTopic);
  const snapshot = ensureInboxNodeInSnapshot({
    activeNodeId,
    layout: initial.layout,
    nodeViewById: { [activeNodeId]: { scrollTop: 0, selection: null, updatedAt: timestamp } },
    nodeOrder: [INBOX_NODE_ID, ...topicNodes.map((node) => node.id)],
    nodesById: Object.fromEntries(topicNodes.map((node) => [node.id, node])),
    rendererBoundaryKeepNodeIds: topicNodes.map((node) => node.id),
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

function createTopicNode(topic: DemoTopic, index: number, timestamp: string): Node {
  return {
    id: toDemoNodeId(topic),
    parentNodeId: INBOX_NODE_ID,
    kind: 'topic',
    title: topic.title,
    isTitleManual: true,
    content: blocksToMarkdown(topic),
    openingText: topic.description,
    reveal: null,
    review: null,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: timestamp,
      nextAt: timestamp,
      priority: index,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'active'
    },
    bodyStatus: 'ready',
    hasContent: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
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
