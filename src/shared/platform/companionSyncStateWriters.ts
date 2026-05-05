import type {
  NativeWorkspaceReadingProfile,
  NativeWorkspaceReviewProfile
} from '../../../lib/platform/nativeStorageContract';
import type { NativeSyncReviewLogDraft } from '../../../lib/platform/nativeSyncContract';

import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

export async function saveCompanionSyncSettingRecord(args: {
  key: string;
  valueJson: string;
  scope?: string;
  platform?: string;
  formFactor?: string;
  deviceId?: string;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  return FolioleCompanionSync.saveSyncSettingRecord({
    device_id: args.deviceId ?? '*',
    form_factor: args.formFactor ?? 'phone',
    key: args.key,
    platform: args.platform ?? 'android',
    scope: args.scope ?? 'device',
    value_json: args.valueJson
  });
}

export async function saveCompanionSyncNodeReadingRecord(args: {
  nodeId: string;
  reading: NativeWorkspaceReadingProfile;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  return FolioleCompanionSync.saveSyncNodeReadingRecord({
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
  });
}

export async function saveCompanionSyncNodeReviewRecord(args: {
  nodeId: string;
  review: NativeWorkspaceReviewProfile;
  reviewLog?: NativeSyncReviewLogDraft;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
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
    review_log_json: args.reviewLog ? JSON.stringify(args.reviewLog) : undefined
  });
}

export async function saveCompanionSyncActiveViewState(nodeId: string | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  return FolioleCompanionSync.saveSyncActiveViewState({ node_id: nodeId });
}

export async function saveCompanionSyncNodeViewState(args: {
  nodeId: string;
  scrollTop: number;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  return FolioleCompanionSync.saveSyncNodeViewState({
    node_id: args.nodeId,
    scroll_top: Math.max(0, Math.trunc(args.scrollTop))
  });
}
