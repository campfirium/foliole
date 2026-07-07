import { normalizeReviewSchedulerSettings } from '../../lib/core/review/settings';
import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  hydrateCurrentReviewSchedulerSettings,
  type ReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';
import {
  loadCompanionSyncIndex,
  loadCompanionSyncObjects
} from '../shared/platform/companionSyncObjects';

const REVIEW_SCHEDULER_SETTINGS_KEY = 'review_scheduler_settings';
const USER_SPACE_SCOPE = 'user_space';

interface SyncSettingPayload {
  key?: string;
  scope?: string;
  value_json?: string;
}

interface ReviewSchedulerSettingsCandidate {
  objectId: string;
  settings: ReviewSchedulerSettings;
  updatedAt: string;
}

export interface CompanionReviewSchedulerSettingsHydrationResult {
  settings: ReviewSchedulerSettings;
  status: 'default' | 'failed' | 'hydrated';
}

export async function hydrateCompanionReviewSchedulerSettings():
Promise<CompanionReviewSchedulerSettingsHydrationResult> {
  const settingObjectIds = await loadReviewSchedulerSettingObjectIds();
  if (settingObjectIds.length === 0) {
    return hydrateDefaultReviewSchedulerSettings();
  }
  const objects = await loadCompanionSyncObjects(settingObjectIds, ['setting']);
  const candidates = objects
    .map((object) => parseReviewSchedulerSettingsCandidate({
      objectId: object.object_id,
      payloadJson: object.payload_json,
      updatedAt: object.updated_at
    }))
    .filter((candidate): candidate is ReviewSchedulerSettingsCandidate => Boolean(candidate));
  const selected = selectLatestCandidate(candidates);
  if (!selected) {
    return { settings: DEFAULT_REVIEW_SCHEDULER_SETTINGS, status: 'failed' };
  }
  hydrateCurrentReviewSchedulerSettings(selected.settings);
  return { settings: selected.settings, status: 'hydrated' };
}

async function loadReviewSchedulerSettingObjectIds() {
  const index = await loadCompanionSyncIndex();
  return index
    .filter((entry) => entry.object_type === 'setting' && isReviewSchedulerSettingsObjectId(entry.object_id))
    .map((entry) => entry.object_id);
}

function hydrateDefaultReviewSchedulerSettings() {
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  return { settings: DEFAULT_REVIEW_SCHEDULER_SETTINGS, status: 'default' as const };
}

function isReviewSchedulerSettingsObjectId(objectId: string) {
  const parts = objectId.split(':');
  return parts.length >= 5 &&
    parts[0] === USER_SPACE_SCOPE &&
    parts.at(-1) === REVIEW_SCHEDULER_SETTINGS_KEY;
}

function parseReviewSchedulerSettingsCandidate(args: {
  objectId: string;
  payloadJson: string | null;
  updatedAt: string;
}) {
  const payload = parseSettingPayload(args.payloadJson);
  if (!payload || payload.key !== REVIEW_SCHEDULER_SETTINGS_KEY || payload.scope !== USER_SPACE_SCOPE) {
    return null;
  }
  const value = parseSettingsValue(payload.value_json);
  if (!isReviewSchedulerSettingsPayload(value)) {
    return null;
  }
  return {
    objectId: args.objectId,
    settings: normalizeReviewSchedulerSettings(value),
    updatedAt: args.updatedAt
  };
}

function parseSettingPayload(payloadJson: string | null): SyncSettingPayload | null {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as SyncSettingPayload;
  } catch {
    return null;
  }
}

function parseSettingsValue(valueJson: string | undefined) {
  if (!valueJson) return null;
  try {
    return JSON.parse(valueJson) as unknown;
  } catch {
    return null;
  }
}

function isReviewSchedulerSettingsPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  return [
    'algorithm',
    'desiredRetention',
    'maximumIntervalDays',
    'newDayStartsAtHour',
    'enableShortTerm',
    'pushQueue',
    'updatedAt'
  ].some((key) => Object.hasOwn(payload, key));
}

function selectLatestCandidate(candidates: ReviewSchedulerSettingsCandidate[]) {
  return [...candidates].sort((left, right) => (
    right.updatedAt.localeCompare(left.updatedAt) || right.objectId.localeCompare(left.objectId)
  ))[0] ?? null;
}
