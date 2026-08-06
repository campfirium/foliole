import type {
  NativeWorkspaceReadingProfile,
  NativeWorkspaceReviewProfile
} from '../../../lib/platform/nativeStorageContract';
import type { NativeSyncReviewLogDraft } from '../../../lib/platform/nativeSyncContract';

import {
  saveIosActiveViewState,
  saveIosNodeViewState,
  saveIosOpenState,
  saveIosReading,
  saveIosReview,
  saveIosSetting
} from './companion/runtime/iosCompanionActiveDatabaseWrites';
import { runCompanionSyncMutationTask } from './companion/sync/mutation/companionSyncMutationRevision';
import {
  getNativeCompanionSettingWritePlatform,
  isNativeCompanionOpenStateWriteRuntime,
  isNativeCompanionReadingWriteRuntime,
  isNativeCompanionReviewWriteRuntime,
  isNativeCompanionViewStateWriteRuntime
} from './companionWorkspaceRuntimeRepository';

export async function saveCompanionSyncNodeOpenState(args: { lastOpenedAt: string; nodeId: string }) {
  if (!isNativeCompanionOpenStateWriteRuntime()) return null;
  return runCompanionSyncMutationTask(() => saveIosOpenState({ last_opened_at: args.lastOpenedAt, node_id: args.nodeId }));
}

export interface CompanionSyncSettingRecordArgs {
  key: string;
  valueJson: string;
  scope?: string;
  platform?: string;
  formFactor?: string;
  deviceId?: string;
}

export function resolveCompanionSyncSettingRecord(
  args: Omit<CompanionSyncSettingRecordArgs, 'valueJson'>
) {
  const nativePlatform = getNativeCompanionSettingWritePlatform();
  if (!nativePlatform) {
    return null;
  }
  const deviceId = args.deviceId ?? '*';
  const formFactor = args.formFactor ?? 'phone';
  const platform = args.platform ?? nativePlatform;
  const scope = args.scope ?? 'device';
  return {
    deviceId,
    formFactor,
    objectId: [scope, platform, formFactor, deviceId, args.key].join(':'),
    platform,
    scope
  };
}

export async function saveCompanionSyncSettingRecord(args: CompanionSyncSettingRecordArgs) {
  const record = resolveCompanionSyncSettingRecord(args);
  if (!record) {
    return null;
  }
  return runCompanionSyncMutationTask(() => saveIosSetting({
    device_id: record.deviceId, form_factor: record.formFactor, key: args.key,
    platform: record.platform, scope: record.scope, value_json: args.valueJson
  }));
}

export async function saveCompanionSyncNodeReadingRecord(args: {
  nodeId: string;
  reading: NativeWorkspaceReadingProfile;
}) {
  if (!isNativeCompanionReadingWriteRuntime()) {
    return null;
  }
  return runCompanionSyncMutationTask(() => saveIosReading({
    node_id: args.nodeId,
    reading_json: JSON.stringify(toReadingPayload(args.reading))
  }));
}

export async function saveCompanionSyncNodeReviewRecord(args: {
  nodeId: string;
  review: NativeWorkspaceReviewProfile;
  reviewLog?: NativeSyncReviewLogDraft;
}) {
  if (!isNativeCompanionReviewWriteRuntime()) return null;
  return runCompanionSyncMutationTask(() => saveCompanionSyncNodeReviewRecordWithinWriterTask(args));
}

export async function saveCompanionSyncNodeReviewRecordWithinWriterTask(args: {
  nodeId: string;
  review: NativeWorkspaceReviewProfile;
  reviewLog?: NativeSyncReviewLogDraft;
}) {
  if (!isNativeCompanionReviewWriteRuntime()) {
    return null;
  }
  return saveIosReview({
    node_id: args.nodeId,
    ...(args.reviewLog ? { review_log_json: JSON.stringify(args.reviewLog) } : {}),
    review_json: JSON.stringify(toReviewPayload(args.review))
  });
}

export async function saveCompanionSyncActiveViewState(nodeId: string | null) {
  if (!isNativeCompanionViewStateWriteRuntime()) {
    return null;
  }
  return runCompanionSyncMutationTask(() => saveIosActiveViewState({ node_id: nodeId }));
}

export async function saveCompanionSyncNodeViewState(args: {
  nodeId: string;
  scrollTop: number;
}) {
  if (!isNativeCompanionViewStateWriteRuntime()) {
    return null;
  }
  return runCompanionSyncMutationTask(() => saveIosNodeViewState({ node_id: args.nodeId, scroll_top: args.scrollTop }));
}

function toReadingPayload(reading: NativeWorkspaceReadingProfile) {
  return {
    interval_duration_ms: reading.intervalDurationMs, interval_growth_factor: reading.intervalGrowthFactor,
    last_handled_at: reading.lastHandledAt, next_at: reading.nextAt, priority: reading.priority,
    reading_position: reading.readingPosition, repetition_count: reading.repetitionCount, state: reading.state
  };
}

function toReviewPayload(review: NativeWorkspaceReviewProfile) {
  return {
    difficulty: review.difficulty, due: review.due, elapsed_days: review.elapsedDays, lapses: review.lapses,
    last_review_at: review.lastReviewAt, reps: review.reps, scheduled_days: review.scheduledDays,
    stability: review.stability, state: review.state
  };
}
