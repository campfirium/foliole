import { writeImportedReviewHistory } from '../../lib/core/database/importedReviewHistory.js';
import { readReviewEvents, sourceDay, type SuperMemoGradeMap } from '../../lib/core/import/superMemoSchedulePreview.js';
import type { SuperMemoXmlDraftElement } from '../../lib/core/import/superMemoXmlDraft.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';

export function superMemoDueInstant(day: string) {
  return new Date(`${day}T00:00:00`).toISOString();
}

export function importSuperMemoReviewHistory(element: SuperMemoXmlDraftElement, nodeId: string, offset: string, gradeMap: SuperMemoGradeMap) {
  const events = readReviewEvents(element, offset, gradeMap) ?? [];
  if (!events.length) return;
  writeImportedReviewHistory(openDatabaseConnection().driver, {
    events, nodeId, host: loadOrCreateDesktopHostName(), source: 'supermemo'
  });
}

export function superMemoTopicReading(element: SuperMemoXmlDraftElement, due: string | null, priority: number, importedAt: string, dismissed = false) {
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
    state: dismissed ? 'dismissed' as const : active ? 'active' as const : 'done' as const
  };
}
