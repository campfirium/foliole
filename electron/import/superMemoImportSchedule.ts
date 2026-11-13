import { IMPORTED_REVIEW_OP_PREFIX } from '../../lib/core/database/initialReviewSchedule.js';
import { INSERT_REVIEW_EVENT_SQL } from '../../lib/core/database/reviewLogRecord.js';
import { recomputeNodeReview } from '../../lib/core/database/reviewProjection.js';
import { readReviewEvents, sourceDay } from '../../lib/core/import/superMemoSchedulePreview.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';

export function superMemoDueInstant(day: string) {
  return new Date(`${day}T00:00:00`).toISOString();
}

export function importSuperMemoReviewHistory(element: SuperMemoXmlDraftElement, nodeId: string, offset: string) {
  const events = readReviewEvents(element, offset) ?? [];
  if (!events.length) return;
  const { driver } = openDatabaseConnection();
  const insert = driver.prepare(INSERT_REVIEW_EVENT_SQL);
  const host = loadOrCreateDesktopHostName();
  for (const event of events) {
    const id = `${IMPORTED_REVIEW_OP_PREFIX}${nodeId}:${event.op_id}`;
    insert.run([id, id, host, nodeId, event.grade, 'supermemo', event.reviewed_at, 'review', null]);
  }
  recomputeNodeReview(driver, nodeId);
}

export function superMemoTopicReading(element: SuperMemoXmlDraftElement, due: string | null, priority: number, importedAt: string) {
  const last = sourceDay(element.learning?.lastRepetition ?? null);
  const lastDay = last === null ? null : new Date(last).toISOString().slice(0, 10);
  const active = due !== null && lastDay !== null && lastDay <= due;
  const handled = lastDay ? superMemoDueInstant(lastDay) : importedAt;
  const next = active ? superMemoDueInstant(due) : handled;
  return {
    intervalDurationMs: Math.max(0, Date.parse(next) - Date.parse(handled)),
    intervalGrowthFactor: 1,
    lastHandledAt: handled,
    nextAt: next,
    priority, readingPosition: 0,
    repetitionCount: Math.max(0, Number.parseInt(element.learning?.repetitions ?? '', 10) || 0),
    state: active ? 'active' as const : 'done' as const
  };
}
