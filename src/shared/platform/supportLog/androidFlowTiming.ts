import { flowTimingStages, flowTimingStatuses, type FlowTiming, type FlowTimingStage, type FlowTimingStatus } from '../../../../lib/core/flow/flowTiming';
import { attachmentTimingKinds, pendingCompanionAttachmentTimings,
  subscribeCompanionAttachmentTimings } from '../companion/runtime/companionAttachmentTiming';

const actions = ['soon', 'read', 'later', 'dismiss', 'grade'] as const;

type Action = typeof actions[number];
type Entry = { operation: number; action: Action; stage: FlowTimingStage; status: FlowTimingStatus; atMs: number; count?: number };
type AttachmentKind = typeof attachmentTimingKinds[number];
type Attachment = { kind: AttachmentKind; fromMs: number; toMs: number; status: 'done' | 'failed' | 'pending' };
type Report = { build: string; events: Entry[]; attachments: Attachment[]; omitted: number };

const limit = 1024;
const attachmentLimit = 128;
const duration = 300_000;
const validBuild = /^(?:[a-f0-9]{7,40}|unidentified)$/u;
let capture: (Report & { startedAt: number; nextOperation: number; generation: number }) | undefined;
let generation = 0;
let unsubscribeAttachments: (() => void) | undefined;

export function startAndroidFlowTiming() {
  const revision = import.meta.env.VITE_FOLIOLE_SOURCE_REVISION;
  const session = capture = { build: validBuild.test(revision ?? '') ? revision! : 'unidentified',
    startedAt: performance.now(), generation: ++generation, nextOperation: 0, events: [], attachments: [], omitted: 0 };
  unsubscribeAttachments?.();
  unsubscribeAttachments = subscribeCompanionAttachmentTimings(({ kind, startedAt }, status) =>
    recordAttachment(session, kind, startedAt, status));
}

export function beginAndroidFlowAction(action: Action): FlowTiming | undefined {
  const session = capture;
  if (!session || !actions.includes(action) || elapsed(session.startedAt) >= duration) return;
  const operation = ++session.nextOperation;
  const recording = session.generation;
  const stamp: FlowTiming = (stage, status, count) => {
    const current = capture;
    if (current?.generation !== recording || !flowTimingStages.includes(stage)
      || !flowTimingStatuses.includes(status) || !validCount(stage, count)) return;
    const atMs = elapsed(current.startedAt);
    if (atMs >= duration) return;
    if (current.events.length === limit) { current.omitted++; return; }
    current.events.push({ operation, action, stage, status, atMs, ...(count === undefined ? {} : { count }) });
  };
  stamp('action', 'start');
  return stamp;
}

function elapsed(start: number) { return Math.max(0, Math.round(performance.now() - start)); }

function recordAttachment(session: NonNullable<typeof capture>, kind: AttachmentKind, start: number, status: Attachment['status']) {
  if (session.attachments.length === attachmentLimit) { session.omitted++; return; }
  session.attachments.push({ kind, fromMs: Math.max(0, Math.min(duration, Math.round(start - session.startedAt))),
    toMs: Math.min(duration, elapsed(session.startedAt)), status });
}

export function stopAndroidFlowTiming(): Report | undefined {
  const session = capture;
  capture = undefined;
  unsubscribeAttachments?.();
  unsubscribeAttachments = undefined;
  if (!session?.events.length) return;
  for (const pending of pendingCompanionAttachmentTimings()) {
    recordAttachment(session, pending.kind, pending.startedAt, 'pending');
  }
  const actionWindows = flowActionWindows(session.events, Math.min(duration, elapsed(session.startedAt)));
  const attachments = session.attachments.filter(attachment => actionWindows
    .some(window => attachment.fromMs <= window.end && attachment.toMs >= window.start));
  return { build: session.build, events: session.events, attachments, omitted: session.omitted };
}

function flowActionWindows(events: Entry[], cutoff: number) {
  const windows = new Map<number, { start: number; end: number; pending: Set<FlowTimingStage> }>();
  for (const event of events) {
    const window = windows.get(event.operation) ?? { start: event.atMs, end: event.atMs, pending: new Set() };
    window.end = event.atMs;
    if (event.status === 'start') window.pending.add(event.stage);
    else window.pending.delete(event.stage);
    windows.set(event.operation, window);
  }
  return [...windows.values()].map(window => ({ start: window.start, end: window.pending.size ? cutoff : window.end }));
}

export function validateAndroidFlowTiming(value: unknown): value is Report {
  if (!value || typeof value !== 'object') return false;
  const report = value as Report;
  return Object.keys(report).length === 4 && typeof report.build === 'string' && validBuild.test(report.build)
    && Number.isSafeInteger(report.omitted) && report.omitted >= 0
    && Array.isArray(report.events) && report.events.length <= limit && report.events.every(event =>
      event && Object.keys(event).length === (event.count === undefined ? 5 : 6) && Number.isSafeInteger(event.operation) && event.operation > 0
      && actions.includes(event.action) && flowTimingStages.includes(event.stage) && flowTimingStatuses.includes(event.status) && validTime(event.atMs)
      && validCount(event.stage, event.count))
    && Array.isArray(report.attachments) && report.attachments.length <= attachmentLimit && report.attachments.every(attachment =>
      attachment && Object.keys(attachment).length === 4 && attachmentTimingKinds.includes(attachment.kind)
      && ['done', 'failed', 'pending'].includes(attachment.status)
      && validTime(attachment.fromMs) && validTime(attachment.toMs) && attachment.fromMs <= attachment.toMs);
}

function validTime(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= duration;
}

function validCount(stage: FlowTimingStage, count: number | undefined) {
  return stage === 'queue-size' ? count !== undefined && Number.isSafeInteger(count) && count >= 0 : count === undefined;
}
