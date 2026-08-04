import type {
  NativeWorkspaceReadingProfile,
  NativeWorkspaceReviewProfile
} from '../../../lib/platform/nativeStorageContract';
import type { NativeSyncReviewLogDraft } from '../../../lib/platform/nativeSyncContract';

import { runCompanionSyncMutationTask } from './companion/sync/mutation/companionSyncMutationRevision';
import {
  FolioleCompanionSync,
  getNativeCompanionSettingWritePlatform,
  isNativeCompanionOpenStateWriteRuntime,
  isNativeCompanionReadingWriteRuntime,
  isNativeCompanionReviewWriteRuntime,
  isNativeCompanionViewStateWriteRuntime
} from './companionWorkspaceRuntimeRepository';

export async function saveCompanionSyncNodeOpenState(args: { lastOpenedAt: string; nodeId: string }) {
  if (!isNativeCompanionOpenStateWriteRuntime()) return null;
  return runCompanionSyncMutationTask(() => FolioleCompanionSync.saveSyncNodeOpenState({
    last_opened_at: args.lastOpenedAt,
    node_id: args.nodeId
  }));
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
  return runCompanionSyncMutationTask(() => (
    FolioleCompanionSync.saveSyncSettingRecord({
      device_id: record.deviceId,
      form_factor: record.formFactor,
      key: args.key,
      platform: record.platform,
      scope: record.scope,
      value_json: args.valueJson
    })
  ));
}

export async function saveCompanionSyncNodeReadingRecord(args: {
  nodeId: string;
  reading: NativeWorkspaceReadingProfile;
}) {
  if (!isNativeCompanionReadingWriteRuntime()) {
    return null;
  }
  return runCompanionSyncMutationTask(() => (
    FolioleCompanionSync.saveSyncNodeReadingRecord({
      node_id: args.nodeId,
      reading_json: JSON.stringify({
        interval_duration_ms: args.reading.intervalDurationMs,
        interval_growth_factor: args.reading.intervalGrowthFactor,
        last_handled_at: args.reading.lastHandledAt,
        next_at: args.reading.nextAt,
        priority: args.reading.priority,
        reading_position: args.reading.readingPosition,
        repetition_count: args.reading.repetitionCount,
        state: args.reading.state
      })
    })
  ));
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
  return FolioleCompanionSync.saveSyncNodeReviewRecord({
    node_id: args.nodeId,
    review_json: JSON.stringify({
      difficulty: args.review.difficulty,
      due: args.review.due,
      elapsed_days: args.review.elapsedDays,
      lapses: args.review.lapses,
      last_review_at: args.review.lastReviewAt,
      reps: args.review.reps,
      scheduled_days: args.review.scheduledDays,
      stability: args.review.stability,
      state: args.review.state
    }),
    ...(args.reviewLog ? { review_log_json: JSON.stringify(args.reviewLog) } : {})
  });
}

export async function saveCompanionSyncActiveViewState(nodeId: string | null) {
  if (!isNativeCompanionViewStateWriteRuntime()) {
    return null;
  }
  return runCompanionSyncMutationTask(() => (
    FolioleCompanionSync.saveSyncActiveViewState({ node_id: nodeId })
  ));
}

export async function saveCompanionSyncNodeViewState(args: {
  nodeId: string;
  scrollTop: number;
}) {
  if (!isNativeCompanionViewStateWriteRuntime()) {
    return null;
  }
  return runCompanionSyncMutationTask(() => (
    FolioleCompanionSync.saveSyncNodeViewState({
      node_id: args.nodeId,
      scroll_top: Math.max(0, Math.trunc(args.scrollTop)),
      source: 'user-scroll'
    })
  ));
}
