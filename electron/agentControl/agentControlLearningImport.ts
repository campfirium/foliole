import { z } from 'zod';

import { writeImportedReviewHistory } from '../../lib/core/database/importedReviewHistory.js';
import type { NodeReadingPayload } from '../../lib/core/database/nodeReadingPayload.js';
import { isAgentControlLearningImportEnabled } from '../database/agentControlLearningImportPermission.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';

import { AgentMaterialMutationError } from './agentControlMaterialMutations.js';

const timestamp = z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString());
const priority = z.int().min(0).max(9);
const reviewEvent = z.strictObject({ reviewed_at: timestamp, grade: z.int().min(1).max(4) });
const reviewSchedule = z.strictObject({ due: timestamp, priority, history: z.array(reviewEvent).min(1).max(1000).optional() })
  .refine(({ due, history }) => history?.every((event, index) =>
    event.reviewed_at <= due && event.reviewed_at <= new Date().toISOString()
    && (index === 0 || event.reviewed_at >= history[index - 1]!.reviewed_at)) ?? true);
const readingSchedule = z.strictObject({
  interval_duration_ms: z.int().nonnegative(),
  interval_growth_factor: z.number().min(1),
  last_handled_at: timestamp,
  next_at: timestamp,
  priority,
  repetition_count: z.int().nonnegative()
}).refine((value) => value.next_at >= value.last_handled_at);

export function readAgentControlTopicLearningImport(kind: string | null, value: unknown): NodeReadingPayload | undefined {
  if (value === undefined) return undefined;
  requireLearningImportPermission();
  const parsed = readingSchedule.safeParse(value);
  if (kind !== 'topic' || !parsed.success) throw new AgentMaterialMutationError('invalid_request', 400);
  const schedule = parsed.data;
  return {
    intervalDurationMs: schedule.interval_duration_ms,
    intervalGrowthFactor: schedule.interval_growth_factor,
    lastHandledAt: schedule.last_handled_at,
    nextAt: schedule.next_at,
    priority: schedule.priority,
    readingPosition: 0,
    repetitionCount: schedule.repetition_count,
    state: 'active'
  };
}

export type AgentControlItemReviewSchedule = z.infer<typeof reviewSchedule>;

export function readAgentControlItemLearningImport(kind: string | null, value: unknown): AgentControlItemReviewSchedule | undefined {
  if (value === undefined) return undefined;
  requireLearningImportPermission();
  const parsed = reviewSchedule.safeParse(value);
  if (kind !== 'item' || !parsed.success) throw new AgentMaterialMutationError('invalid_request', 400);
  return parsed.data;
}

function requireLearningImportPermission() {
  if (!isAgentControlLearningImportEnabled()) {
    throw new AgentMaterialMutationError('learning_import_disabled', 403);
  }
}

export function persistAgentControlReviewHistory(nodeId: string, history: NonNullable<AgentControlItemReviewSchedule['history']>) {
  writeImportedReviewHistory(openDatabaseConnection().driver, {
    nodeId, host: loadOrCreateDesktopHostName(), source: 'agent-control',
    events: history.map((event, index) => ({ ...event, op_id: String(index).padStart(10, '0') }))
  });
}
