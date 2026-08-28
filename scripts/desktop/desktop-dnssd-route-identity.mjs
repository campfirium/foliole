import { createHash } from 'node:crypto';

export function desktopDnsSdRouteFixtureFact(identity) {
  const fixture = [identity.groupId, identity.localDeviceId, identity.peerDeviceId];
  return createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
}

export function reciprocalDesktopDnsSdRouteIdentity(identity) {
  return {
    groupId: identity.groupId,
    localDeviceId: identity.peerDeviceId,
    peerDeviceId: identity.localDeviceId
  };
}
