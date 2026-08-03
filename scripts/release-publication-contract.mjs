const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

function bridgeVersion(manifest) {
  const value = manifest?.desktopUpdater?.compatibilityBridgeVersion;
  return typeof value === 'string' && VERSION.test(value) ? value : null;
}

function sameMembers(left, right) {
  return [...left].sort().join(',') === [...right].sort().join(',');
}

function requireBridgeRecord(identity, manifest, version) {
  const entry = manifest?.releases?.find((candidate) => candidate?.version === version);
  if (!entry || !sameMembers(entry.platforms ?? [], identity.activePlatforms)) {
    throw new Error('scoped publication requires a full-platform compatibility bridge record.');
  }
}

export function resolveReleasePublication(identity, manifest) {
  const mode = identity.intent.publicationMode;
  const existingBridge = bridgeVersion(manifest);
  if (mode === 'legacy') return { bridgeVersion: existingBridge, makeLatest: null, mode };
  if (mode === 'bridge') {
    if (existingBridge) throw new Error(`compatibility bridge is already frozen at ${existingBridge}.`);
    if (!sameMembers(identity.intent.selectedPlatforms, identity.activePlatforms)) {
      throw new Error('compatibility bridge must select every active platform.');
    }
    return { bridgeVersion: identity.intent.version, makeLatest: true, mode };
  }
  if (!existingBridge) throw new Error('scoped publication requires a compatibility bridge version.');
  requireBridgeRecord(identity, manifest, existingBridge);
  return { bridgeVersion: existingBridge, makeLatest: false, mode };
}

export function assertT7Publication(identity, manifest) {
  const publication = resolveReleasePublication(identity, manifest);
  if (publication.mode === 'legacy') {
    throw new Error('T7 requires bridge or scoped publicationMode; legacy is historical only.');
  }
  return publication;
}

export function assertPublishedManifestScope({ identity, manifest, previousManifest }) {
  if (identity.intent.publicationMode === 'bridge' &&
      !sameMembers(identity.intent.selectedPlatforms, identity.activePlatforms)) {
    throw new Error('compatibility bridge must select every active platform.');
  }
  const publication = identity.intent.publicationMode === 'bridge'
    ? { bridgeVersion: identity.intent.version, makeLatest: true, mode: 'bridge' }
    : resolveReleasePublication(identity, previousManifest ?? manifest);
  const entry = manifest?.releases?.find((candidate) => candidate?.version === identity.intent.version);
  if (!entry || !sameMembers(entry.platforms ?? [], identity.intent.selectedPlatforms)) {
    throw new Error('published manifest platforms must exactly match release intent.');
  }
  const recordedBridge = bridgeVersion(manifest);
  if (publication.mode === 'bridge' && recordedBridge !== identity.intent.version) {
    throw new Error('bridge publication must freeze compatibilityBridgeVersion at the published version.');
  }
  if (publication.mode === 'scoped' && recordedBridge !== publication.bridgeVersion) {
    throw new Error('scoped publication must preserve compatibilityBridgeVersion.');
  }
  return publication;
}
