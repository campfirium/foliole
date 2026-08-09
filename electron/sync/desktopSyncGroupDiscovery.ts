import { Bonjour } from 'bonjour-service';

import type { DesktopSyncGroupJoinCandidatePayload } from '../../lib/platform/nativeCompanionSyncContract.js';

const DISCOVERY_MS = 1_800;

export async function discoverDesktopSyncGroups(excludedDeviceId?: string) {
  const results = new Map<string, DesktopSyncGroupJoinCandidatePayload>();
  const bonjour = new Bonjour();
  const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, (service) => {
    const txt = service.txt as Record<string, unknown>;
    if (typeof txt.peer_id === 'string' && txt.peer_id === excludedDeviceId) return;
    const host = service.addresses?.find((value) => /^\d+\.\d+\.\d+\.\d+$/.test(value)) ??
      (/^\d+\.\d+\.\d+\.\d+$/.test(service.referer?.address ?? '') ? service.referer?.address : null);
    if (!host || !service.port || typeof txt.group_id !== 'string' || typeof txt.timeline_id !== 'string') return;
    const candidate = {
      endpoint_url: `http://${host}:${service.port}`,
      group_display_name: typeof txt.group_display_name === 'string' ? txt.group_display_name : service.name,
      group_id: txt.group_id,
      provider_device_id: typeof txt.peer_id === 'string' ? txt.peer_id : service.name,
      provider_device_kind: 'android-capacitor',
      provider_device_name: service.name,
      timeline_id: txt.timeline_id
    } satisfies DesktopSyncGroupJoinCandidatePayload;
    results.set(`${candidate.group_id}:${candidate.endpoint_url}`, candidate);
  });
  await new Promise((resolve) => setTimeout(resolve, DISCOVERY_MS));
  browser.stop();
  bonjour.destroy();
  return [...results.values()].sort((left, right) => left.group_display_name.localeCompare(right.group_display_name));
}
