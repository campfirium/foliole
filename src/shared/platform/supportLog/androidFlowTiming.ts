import { flowTimingStages, flowTimingStatuses, type FlowTiming } from '../../../../lib/core/flow/flowTiming';
import { pendingCompanionActivityTimings, subscribeCompanionActivityTimings } from '../companion/runtime/companionActivityTiming';
import { pendingCompanionAttachmentTimings, subscribeCompanionAttachmentTimings } from '../companion/runtime/companionAttachmentTiming';
import type { CompanionFlowDiagnosticContext } from '../companion/runtime/companionFlowDiagnosticContext';

import { readCardFacts, resolveCards, type CardFacts, type PendingCard } from './androidFlowCards';
import { startMainThreadSampler } from './androidFlowMainThread';
import {
  flowActions, recordingMs, reportLimits, validBuild, validCount, writerHolderKinds, writerWaitStages,
  type AndroidFlowReport, type FlowActivity, type FlowAttachment, type FlowWriterWait
} from './androidFlowTimingReport';
import { flowActionWindows, overlapping } from './androidFlowWindows';

export { validateAndroidFlowTiming } from './androidFlowTimingReport';

type Action = typeof flowActions[number];
const writerWaitThresholdMs = 200;
const activityBuffer = 512;
type Capture = Omit<AndroidFlowReport, 'cards' | 'mainThread' | 'session'> & {
  startedAt: number; nextOperation: number; generation: number; appRunningMs: number; cards: PendingCard[];
  currentCard?: { nodeId: string; facts: CardFacts }; predictions: Map<string, string | null>; operations: WeakMap<FlowTiming, number>;
  context?: CompanionFlowDiagnosticContext; stopMainThread: () => AndroidFlowReport['mainThread'];
  mainThread?: AndroidFlowReport['mainThread']; cleanup: (() => void)[];
};
let capture: Capture | undefined;
let generation = 0;

export function startAndroidFlowTiming() {
  stopCapture();
  const revision = import.meta.env.VITE_FOLIOLE_SOURCE_REVISION;
  const session: Capture = capture = { build: validBuild.test(revision ?? '') ? revision! : 'unidentified',
    startedAt: performance.now(), appRunningMs: Math.round(performance.now()), generation: ++generation, nextOperation: 0,
    events: [], attachments: [], activities: [], writerWaits: [], cards: [], omitted: 0, predictions: new Map(),
    operations: new WeakMap(), stopMainThread: startMainThreadSampler(), cleanup: [] };
  session.cleanup.push(subscribeCompanionAttachmentTimings(({ kind, startedAt }, status) =>
    pushAttachment(session, { kind, ...span(session, startedAt), status })));
  session.cleanup.push(subscribeCompanionActivityTimings(({ kind, startedAt }, completion) =>
    pushActivity(session, { kind, ...span(session, startedAt), ...completion })));
  void import('../companion/runtime/companionFlowDiagnosticContext')
    .then(module => module.readCompanionFlowDiagnosticContext())
    .then(context => { if (capture === session) session.context = context; }, () => undefined);
}

export function beginAndroidFlowAction(action: Action): FlowTiming | undefined {
  const session = capture;
  if (!session || !flowActions.includes(action) || elapsed(session.startedAt) >= recordingMs) return;
  const operation = ++session.nextOperation;
  const waits = new Map<string, ReturnType<typeof setTimeout>>();
  const stamp: FlowTiming = (stage, status, count) => {
    if (capture !== session || !flowTimingStages.includes(stage) || !flowTimingStatuses.includes(status)
      || !validCount(stage, count)) return;
    const atMs = elapsed(session.startedAt);
    if (atMs >= recordingMs) return;
    if (session.events.length === reportLimits.events) session.omitted++;
    else session.events.push({ operation, action, stage, status, atMs, ...(count === undefined ? {} : { count }) });
    if (!(writerWaitStages as readonly string[]).includes(stage)) return;
    clearTimeout(waits.get(stage));
    waits.delete(stage);
    if (status === 'start') waits.set(stage, setTimeout(() => recordWriterWait(session, operation,
      stage as FlowWriterWait['stage']), writerWaitThresholdMs));
  };
  session.operations.set(stamp, operation);
  session.cleanup.push(() => waits.forEach(clearTimeout));
  if (session.currentCard && session.cards.length < reportLimits.cards) {
    session.cards.push({ operation, role: 'current', ...session.currentCard.facts });
  }
  stamp('action', 'start');
  return stamp;
}

/** Notes the card a Flow action will leave; only derived counts reach the report. */
export function noteAndroidFlowCard(nodeId: string, content: string) {
  if (capture && capture.currentCard?.nodeId !== nodeId) capture.currentCard = { nodeId, facts: readCardFacts(content) };
}

/** Records the card an action displayed and whether the speculative successor matched it. */
export function recordAndroidFlowNextCard(timing: FlowTiming, nodeId: string, content: string) {
  const session = capture;
  const operation = session?.operations.get(timing);
  if (!session || !operation) return;
  const source = session.currentCard?.nodeId;
  const predicted = source === undefined ? undefined : session.predictions.get(source);
  timing(predicted === undefined ? 'predict-absent' : predicted === nodeId ? 'predict-hit' : 'predict-miss', 'done');
  session.predictions.clear();
  session.currentCard = { nodeId, facts: readCardFacts(content) };
  if (session.cards.length < reportLimits.cards) session.cards.push({ operation, role: 'next', ...session.currentCard.facts });
}

export function noteAndroidFlowPrediction(currentNodeId: string, predictedNodeId: string | null) {
  capture?.predictions.set(currentNodeId, predictedNodeId);
}

export function stopAndroidFlowTiming(): AndroidFlowReport | undefined {
  const session = capture;
  stopCapture();
  if (!session?.events.length) return;
  for (const { kind, startedAt } of pendingCompanionAttachmentTimings()) {
    pushAttachment(session, { kind, ...span(session, startedAt), status: 'pending' });
  }
  for (const { kind, startedAt } of pendingCompanionActivityTimings()) {
    pushActivity(session, { kind, ...span(session, startedAt), status: 'pending' });
  }
  const windows = flowActionWindows(session.events, Math.min(recordingMs, elapsed(session.startedAt)));
  const activities = overlapping(session.activities, windows);
  const context = session.context;
  return { build: session.build, events: session.events, attachments: overlapping(session.attachments, windows),
    activities: activities.slice(0, reportLimits.activities), writerWaits: session.writerWaits,
    cards: resolveCards(session.cards, context?.sizes), mainThread: session.mainThread!,
    session: { appRunningMs: session.appRunningMs, sinceDayStartMs: context?.sinceDayStartMs ?? 0,
      nodes: context?.nodes ?? null, attachmentFiles: context?.attachmentFiles ?? null,
      attachmentBytes: context?.attachmentBytes ?? null, observedToday: context?.observedToday ?? null },
    omitted: session.omitted + Math.max(0, activities.length - reportLimits.activities) };
}

function stopCapture() {
  const session = capture;
  capture = undefined;
  if (!session) return;
  session.cleanup.splice(0).forEach(cleanup => cleanup());
  session.mainThread ??= session.stopMainThread();
}

function recordWriterWait(session: Capture, operation: number, stage: FlowWriterWait['stage']) {
  if (capture !== session) return;
  if (session.writerWaits.length === reportLimits.writerWaits) { session.omitted++; return; }
  const active = new Set([...pendingCompanionAttachmentTimings(), ...pendingCompanionActivityTimings()].map(timing => timing.kind));
  session.writerWaits.push({ operation, stage, atMs: Math.min(recordingMs, elapsed(session.startedAt)),
    active: writerHolderKinds.filter(kind => active.has(kind)) });
}

function pushAttachment(session: Capture, entry: FlowAttachment) {
  if (session.attachments.length === reportLimits.attachments) session.omitted++;
  else session.attachments.push(entry);
}

function pushActivity(session: Capture, entry: FlowActivity) {
  if (session.activities.length === activityBuffer) session.omitted++;
  else session.activities.push(entry);
}

function span(session: Capture, start: number) {
  return { fromMs: Math.max(0, Math.min(recordingMs, Math.round(start - session.startedAt))),
    toMs: Math.min(recordingMs, elapsed(session.startedAt)) };
}

function elapsed(start: number) { return Math.max(0, Math.round(performance.now() - start)); }
