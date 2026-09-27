import type { DesktopDnsSdService } from '@foliole/desktop-dnssd';

export type MemberObservation = {
  deviceId: string;
  endpointUrl: string;
  service: DesktopDnsSdService;
};
type Exchange = (observation: MemberObservation, isCurrent: () => boolean) => Promise<void>;
type DiscoveryState = {
  services: Map<string, Map<string, MemberObservation>>;
  latest: Map<string, MemberObservation>;
  pending: Map<string, MemberObservation>;
  running: Set<string>;
  exchange: Exchange;
};

function serviceKey(service: DesktopDnsSdService) {
  return JSON.stringify([service.interfaceIndex, service.fqdn || service.name,
    service.txt.runtime_instance_id]);
}

async function drain(state: DiscoveryState, deviceId: string) {
  if (state.running.has(deviceId)) return;
  state.running.add(deviceId);
  try {
    while (state.pending.has(deviceId)) {
      const observation = state.pending.get(deviceId)!;
      state.pending.delete(deviceId);
      await state.exchange(observation, () => state.latest.get(deviceId) === observation);
    }
  } finally {
    state.running.delete(deviceId);
  }
}

function schedule(state: DiscoveryState, observation: MemberObservation) {
  state.latest.set(observation.deviceId, observation);
  state.pending.set(observation.deviceId, observation);
  void drain(state, observation.deviceId);
}

function loseService(state: DiscoveryState, deviceId: string, service: DesktopDnsSdService,
  onLost: (deviceId: string) => void) {
  const known = state.services.get(deviceId);
  const key = serviceKey(service);
  const removed = known?.get(key);
  if (!known || !removed) return;
  known.delete(key);
  if (state.latest.get(deviceId) !== removed) return;
  const remaining = [...known.values()].at(-1);
  if (remaining) return schedule(state, remaining);
  state.services.delete(deviceId);
  state.latest.delete(deviceId);
  state.pending.delete(deviceId);
  onLost(deviceId);
}

// Keep the latest announcement while a device's previous exchange finishes.
export function createDesktopSyncGroupMemberDiscovery(exchange: Exchange,
  onLost: (deviceId: string) => void) {
  const state: DiscoveryState = {
    services: new Map(), latest: new Map(), pending: new Map(), running: new Set(), exchange
  };
  return {
    found(observation: MemberObservation) {
      const known = state.services.get(observation.deviceId) ?? new Map<string, MemberObservation>();
      const key = serviceKey(observation.service);
      known.delete(key);
      known.set(key, observation);
      state.services.set(observation.deviceId, known);
      schedule(state, observation);
    },
    lost: (deviceId: string, service: DesktopDnsSdService) =>
      loseService(state, deviceId, service, onLost),
    reset() {
      state.services.clear();
      state.latest.clear();
      state.pending.clear();
    }
  };
}
