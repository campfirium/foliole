import { flowTimingCountStages, flowTimingStages, flowTimingStatuses, type FlowTimingStage, type FlowTimingStatus } from '../../../../lib/core/flow/flowTiming';
import { companionActivityKinds, type CompanionActivityKind } from '../companion/runtime/companionActivityTiming';
import { attachmentTimingKinds } from '../companion/runtime/companionAttachmentTiming';

import { mainThreadSources, type MainThreadSummary } from './androidFlowMainThread';

export const flowActions = ['soon', 'read', 'later', 'dismiss', 'grade'] as const;
export const writerWaitStages = ['open-queue', 'open-writer', 'mutation-queue', 'mutation-writer'] as const;
export const writerHolderKinds = [...attachmentTimingKinds, ...companionActivityKinds] as const;
export const reportLimits = { events: 1024, attachments: 128, activities: 128, writerWaits: 64, cards: 256 } as const;
export const recordingMs = 300_000;

type Status = 'done' | 'failed' | 'pending';
export type FlowEntry = { operation: number; action: typeof flowActions[number]; stage: FlowTimingStage;
  status: FlowTimingStatus; atMs: number; count?: number };
export type FlowAttachment = { kind: typeof attachmentTimingKinds[number]; fromMs: number; toMs: number; status: Status };
export type FlowActivity = { kind: CompanionActivityKind; fromMs: number; toMs: number; status: Status; queueMs?: number; runMs?: number };
export type FlowWriterWait = { operation: number; stage: typeof writerWaitStages[number]; atMs: number;
  active: typeof writerHolderKinds[number][] };
export type FlowCard = { operation: number; role: 'current' | 'next'; images: number; imageBytes: number;
  unsizedImages: number; bodyChars: number };
export type FlowSession = { appRunningMs: number; sinceDayStartMs: number; nodes: number | null;
  attachmentFiles: number | null; attachmentBytes: number | null; observedToday: boolean | null };
export type AndroidFlowReport = { build: string; events: FlowEntry[]; attachments: FlowAttachment[]; activities: FlowActivity[];
  writerWaits: FlowWriterWait[]; cards: FlowCard[]; mainThread: MainThreadSummary; session: FlowSession | null; omitted: number };

export const validBuild = /^(?:[a-f0-9]{7,40}|unidentified)$/u;
const statuses: readonly Status[] = ['done', 'failed', 'pending'];

export function validateAndroidFlowTiming(value: unknown): value is AndroidFlowReport {
  if (!isRecord(value, 9)) return false;
  const report = value as AndroidFlowReport;
  return typeof report.build === 'string' && validBuild.test(report.build) && count(report.omitted)
    && list(report.events, reportLimits.events, validEntry) && list(report.attachments, reportLimits.attachments, validAttachment)
    && list(report.activities, reportLimits.activities, validActivity)
    && list(report.writerWaits, reportLimits.writerWaits, validWriterWait) && list(report.cards, reportLimits.cards, validCard)
    && validMainThread(report.mainThread) && (report.session === null || validSession(report.session));
}

export function validCount(stage: FlowTimingStage, value: number | undefined) {
  return (flowTimingCountStages as readonly string[]).includes(stage) ? value !== undefined && count(value) : value === undefined;
}

export function validTime(value: unknown): value is number {
  return count(value) && value <= recordingMs;
}

function validEntry(event: FlowEntry) {
  return isRecord(event, event.count === undefined ? 5 : 6) && count(event.operation) && event.operation > 0
    && flowActions.includes(event.action) && flowTimingStages.includes(event.stage)
    && flowTimingStatuses.includes(event.status) && validTime(event.atMs) && validCount(event.stage, event.count);
}

function validAttachment(entry: FlowAttachment) {
  return isRecord(entry, 4) && attachmentTimingKinds.includes(entry.kind) && validSpan(entry);
}

function validActivity(entry: FlowActivity) {
  const timed = entry.queueMs !== undefined;
  return isRecord(entry, timed ? 6 : 4) && companionActivityKinds.includes(entry.kind) && validSpan(entry)
    && (!timed || (entry.kind.startsWith('native.') && validTime(entry.queueMs) && validTime(entry.runMs)));
}

function validSpan(entry: { fromMs: number; toMs: number; status: Status }) {
  return statuses.includes(entry.status) && validTime(entry.fromMs) && validTime(entry.toMs) && entry.fromMs <= entry.toMs;
}

function validWriterWait(entry: FlowWriterWait) {
  return isRecord(entry, 4) && count(entry.operation) && entry.operation > 0 && writerWaitStages.includes(entry.stage)
    && validTime(entry.atMs) && Array.isArray(entry.active) && entry.active.length <= writerHolderKinds.length
    && new Set(entry.active).size === entry.active.length && entry.active.every(kind => writerHolderKinds.includes(kind));
}

function validCard(card: FlowCard) {
  return isRecord(card, 6) && count(card.operation) && card.operation > 0 && (card.role === 'current' || card.role === 'next')
    && count(card.images) && count(card.imageBytes) && count(card.unsizedImages) && card.unsizedImages <= card.images
    && count(card.bodyChars);
}

function validMainThread(value: MainThreadSummary) {
  return isRecord(value, 3) && mainThreadSources.includes(value.source) && count(value.longTasks) && validTime(value.maxMs);
}

function validSession(session: FlowSession) {
  const optional = (field: number | null) => field === null || count(field);
  return isRecord(session, 6) && count(session.appRunningMs) && count(session.sinceDayStartMs)
    && session.sinceDayStartMs <= 90_000_000 && optional(session.nodes) && optional(session.attachmentFiles)
    && optional(session.attachmentBytes) && (session.observedToday === null || typeof session.observedToday === 'boolean');
}

function list<T>(value: T[], limit: number, valid: (item: T) => boolean) {
  return Array.isArray(value) && value.length <= limit && value.every(valid);
}

function isRecord(value: unknown, keys: number): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === keys;
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
