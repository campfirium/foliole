import type {
  DesktopCompanionPairingOverviewPayload,
  DesktopSyncGroupJoinCandidatePayload
} from '../../../../lib/platform/nativeCompanionSyncContract';

export function normalizeJoinCandidates(value: unknown): DesktopSyncGroupJoinCandidatePayload[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DesktopSyncGroupJoinCandidatePayload => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const raw = item as Record<string, unknown>;
    return ['endpoint_url', 'group_display_name', 'group_id', 'provider_device_id', 'provider_device_kind',
      'provider_device_name', 'timeline_id'].every((key) => typeof raw[key] === 'string');
  });
}

export function normalizeJoinRequest(
  value: unknown
): NonNullable<DesktopCompanionPairingOverviewPayload['join_request']> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.status !== 'pending' || !['endpoint_url', 'expires_at', 'group_id', 'pair_request_id', 'timeline_id']
    .every((key) => typeof raw[key] === 'string')) return null;
  return raw as unknown as NonNullable<DesktopCompanionPairingOverviewPayload['join_request']>;
}
