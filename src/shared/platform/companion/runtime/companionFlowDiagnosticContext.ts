import { resolveCurrentDayStart } from '../../../../../lib/core/review/reviewDayBoundary';
import { getCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore';

import { companionAttachmentDay } from './companionAttachmentMaintenance';

export type CompanionFlowDiagnosticContext = {
  sinceDayStartMs: number; nodes: number | null;
  attachmentFiles: number | null; attachmentBytes: number | null; observedToday: boolean | null;
  sizes: ReadonlyMap<string, number>;
};

/** Reads library scale for a support recording; unreadable facts stay unknown instead of failing the recording. */
export async function readCompanionFlowDiagnosticContext(): Promise<CompanionFlowDiagnosticContext> {
  const now = new Date();
  const dayStart = resolveCurrentDayStart(now, getCurrentReviewSchedulerSettings().newDayStartsAtHour);
  const snapshot = companionWorkspaceSnapshots.getSnapshot();
  const [files, observedToday] = await Promise.all([readAttachmentFiles(), readObservedToday(now)]);
  return { sinceDayStartMs: Math.max(0, now.getTime() - dayStart.getTime()),
    nodes: snapshot ? Object.keys(snapshot.nodesById).length : null,
    attachmentFiles: files ? files.length : null,
    attachmentBytes: files ? files.reduce((sum, file) => sum + file.sizeBytes, 0) : null,
    observedToday, sizes: new Map(files?.map(file => [file.storageKey, file.sizeBytes])) };
}

async function readAttachmentFiles() {
  try {
    // Not published as attachment maintenance: this read belongs to the recording itself.
    const result = await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'inventory', trash: false });
    return result.files?.filter(file => Number.isSafeInteger(file.sizeBytes) && file.sizeBytes >= 0) ?? null;
  } catch {
    return null;
  }
}

async function readObservedToday(now: Date) {
  try {
    const { state } = await FolioleCompanionSync.maintainAttachmentFiles({ operation: 'read-state' });
    const parsed: unknown = state ? JSON.parse(state) : null;
    const day = parsed && typeof parsed === 'object' ? (parsed as { lastObservationDay?: unknown }).lastObservationDay : null;
    return day === companionAttachmentDay(now);
  } catch {
    return null;
  }
}
