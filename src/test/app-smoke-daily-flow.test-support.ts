import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { dailyFlowCommitSchema, dailyFlowOpenSchema, type DailyFlowSnapshot } from '../../lib/core/flow/dailyFlowContract';
import { advanceDailyGrade } from '../../lib/core/flow/dailyFlowGrade';
import { flowDay, flowPlan, prepareFlowSession } from '../../lib/core/flow/dailyFlowPlanning';
import { advanceDailyReading } from '../../lib/core/flow/dailyFlowReading';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { dailyFlowSourceSettingsSchema } from '../../lib/core/flow/dailyFlowSourceSettings';
import { sourceSettingsReadingChanges } from '../../lib/core/flow/dailyFlowSourceSettingsLearning';
import { dailyFlowViewSchema, type DailyFlowView } from '../../lib/core/flow/dailyFlowViewContract';
import { restoreFlowHistorySession } from '../../lib/core/flow/flowHistorySession';
import type { Node } from '../features/nodes/model/nodeTypes';
import { toNodeReviewProfile } from '../features/review/model/reviewTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

function toSmokeSnapshot(node: Node): WorkspaceNodeSnapshot {
  return { ...node, isTitleManual: node.isTitleManual ?? false,
    hideTitleHeading: node.hideTitleHeading ?? false, anchorLink: node.anchorLink ?? null,
    reading: node.reading ?? null, review: node.review ?? null };
}

function smokeLearning(state: DailyFlowSnapshot, nodeIds: string[]) {
  return nodeIds.flatMap(nodeId => {
    const node = state.nodesById[nodeId];
    return node ? [{ nodeId, reading: node.reading, review: node.review }] : [];
  });
}

function saveSmokeSourceSettings(state: DailyFlowSnapshot, persistedNodes: DailyFlowSnapshot['nodesById'], payload: unknown) {
  const args = dailyFlowSourceSettingsSchema.parse(payload);
  const readings = sourceSettingsReadingChanges(state, args).map(value => ({ nodeId: value.nodeId, reading: value.after }));
  for (const value of readings) persistedNodes[value.nodeId] = { ...state.nodesById[value.nodeId]!, reading: value.reading };
  return { updatedAt: args.now, readings };
}

function smokeView(payload: unknown, state: DailyFlowSnapshot, session: DailyFlowSession | undefined, revision: number): DailyFlowView {
  const args = dailyFlowViewSchema.parse(payload);
  const settings = getCurrentReviewSchedulerSettings();
  const plan = flowPlan(state, args.mode, args.now, settings);
  return { status: 'ready', scope: 'smoke', dayKey: flowDay(args.now, settings), revision,
    now: args.now, mode: args.mode, currentNodeId: session?.currentNodeId ?? null,
    nodeIds: args.includeEntries ? plan.queueNodeIds : null, complete: args.includeEntries,
    modeAvailability: { recommended: plan.fsrsQueueNodeIds.length + plan.readingQueueNodeIds.length > 0,
      'review-first': plan.fsrsQueueNodeIds.length > 0, 'reading-only': plan.readingQueueNodeIds.length > 0 },
    canContinueReading: Boolean(session?.continueNodeId) };
}

export function createSmokeDailyFlow() {
  let session: DailyFlowSession | undefined;
  let mode: 'recommended' | 'review-first' | 'reading-only' = 'recommended';
  let persistedNodes: DailyFlowSnapshot['nodesById'] = {};
  let revision = 0;

  async function snapshot(): Promise<DailyFlowSnapshot> {
    const { useWorkspaceStore } = await import('../store/workspaceStore');
    const state = useWorkspaceStore.getState();
    const nodesById = Object.fromEntries(Object.entries(state.nodesById)
      .map(([id, node]) => [id, toSmokeSnapshot(node)]));
    return { nodeOrder: state.nodeOrder, nodesById: { ...nodesById, ...persistedNodes },
      trashedNodeIds: state.trashedNodeIds };
  }

  function receipt(now: string, nodes: DailyFlowSnapshot['nodesById']) {
    if (!session) throw new Error('smoke_daily_flow_not_open');
    session = { ...session, daily: { scope: 'smoke', dayKey: flowDay(now, getCurrentReviewSchedulerSettings()),
      revision: ++revision } };
    return { session, nodes, mutationTimestamp: now };
  }

  async function open(payload: unknown) {
    const args = dailyFlowOpenSchema.parse(payload);
    const state = await snapshot();
    mode = args.mode;
    session = prepareFlowSession(state, args, getCurrentReviewSchedulerSettings(), session ?? args.seed);
    return receipt(args.now, state.nodesById);
  }

  async function commit(payload: unknown) {
    const args = dailyFlowCommitSchema.parse(payload);
    if (!session || args.token.revision !== session.daily?.revision) throw new Error('daily_flow_changed');
    const state = await snapshot();
    const card = args.grade?.cardAfter;
    if (args.grade && card) {
      const node = state.nodesById[args.grade.nodeId]!;
      persistedNodes = { ...persistedNodes, [args.grade.nodeId]: { ...node, review: toNodeReviewProfile(card) } };
    }
    if (args.reviewHistory) {
      const node = state.nodesById[args.reviewHistory.nodeId]!;
      persistedNodes = { ...persistedNodes, [args.reviewHistory.nodeId]: { ...node, review: args.reviewHistory.after } };
    }
    for (const value of args.readings ?? []) {
      persistedNodes = { ...persistedNodes, [value.nodeId]: { ...state.nodesById[value.nodeId]!, reading: value.after } };
    }
    const updated = { ...state, nodesById: { ...state.nodesById, ...persistedNodes } };
    const settings = getCurrentReviewSchedulerSettings();
    session = args.grade ? advanceDailyGrade(updated, session, args.now, settings)
      : args.readingAction ? advanceDailyReading(updated, session, args.now, mode, settings)
        : args.nextSession ? restoreFlowHistorySession(args.nextSession, session) : session;
    return { ...receipt(args.now, updated.nodesById), ...(card ? { card } : {}),
      ...(args.readings ? { readings: args.readings.map(value => ({ nodeId: value.nodeId, reading: value.after })) } : {}) };
  }

  return { open, commit, learning: async (nodeIds: string[]) => smokeLearning(await snapshot(), nodeIds),
    saveSourceSettings: async (payload: unknown) => saveSmokeSourceSettings(await snapshot(), persistedNodes, payload),
    view: async (payload: unknown) => smokeView(payload, await snapshot(), session, revision) };
}
