import { createHash } from 'node:crypto';

const PLATFORM_ID = /^[a-z][a-z0-9-]*$/u;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`);
  return value.trim();
}

function requireVersion(value, label) {
  const version = requireString(value, label);
  if (!VERSION.test(version)) throw new Error(`${label} must be a semantic version.`);
  return version;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array.`);
  const strings = value.map((entry, index) => requireString(entry, `${label}[${index}]`));
  if (new Set(strings).size !== strings.length) throw new Error(`${label} must not contain duplicates.`);
  return strings;
}

function validateUpdate(update, label) {
  if (!update || !['electron-updater', 'manual', 'store'].includes(update.mode)) {
    throw new Error(`${label}.mode must be electron-updater, manual, or store.`);
  }
  if (update.mode === 'electron-updater') requireVersion(update.baselineVersion, `${label}.baselineVersion`);
  if (update.mode !== 'electron-updater' && update.baselineVersion !== null) {
    throw new Error(`${label}.baselineVersion must be null outside electron-updater.`);
  }
  return { baselineVersion: update.baselineVersion, mode: update.mode };
}

function validateRetirement(retirement, label) {
  if (!retirement) throw new Error(`${label}.retirement is required for a retired platform.`);
  for (const field of ['lastPublicVersion', 'feedUrl', 'archiveUrl', 'reason']) {
    requireString(retirement[field], `${label}.retirement.${field}`);
  }
  requireVersion(retirement.lastPublicVersion, `${label}.retirement.lastPublicVersion`);
  return { ...retirement };
}

function validatePlatform(platform, index) {
  const label = `platforms[${index}]`;
  const id = requireString(platform?.id, `${label}.id`);
  if (!PLATFORM_ID.test(id)) throw new Error(`${label}.id must be a lowercase platform identifier.`);
  if (!['active', 'retired'].includes(platform.status)) {
    throw new Error(`${label}.status must be active or retired.`);
  }
  if (typeof platform.t7Required !== 'boolean') throw new Error(`${label}.t7Required must be boolean.`);
  const normalized = {
    id,
    displayName: requireString(platform.displayName, `${label}.displayName`),
    status: platform.status,
    architectures: requireStringArray(platform.architectures, `${label}.architectures`),
    deliveryChannel: requireString(platform.deliveryChannel, `${label}.deliveryChannel`),
    t7Required: platform.t7Required,
    artifactContract: requireString(platform.artifactContract, `${label}.artifactContract`),
    managedAssets: requireStringArray(platform.managedAssets, `${label}.managedAssets`),
    update: validateUpdate(platform.update, `${label}.update`)
  };
  if (platform.status === 'retired') normalized.retirement = validateRetirement(platform.retirement, label);
  if (platform.status === 'active' && platform.retirement !== undefined) {
    throw new Error(`${label}.retirement is only valid for a retired platform.`);
  }
  return normalized;
}

export function validatePlatformRegistry(registry) {
  if (registry?.schemaVersion !== 1) throw new Error('platform registry schemaVersion must be 1.');
  if (registry.updaterBaselineVersion !== undefined) {
    throw new Error('platform registry must keep updater baselines on each platform.');
  }
  if (!Array.isArray(registry.platforms) || registry.platforms.length === 0) {
    throw new Error('platform registry must contain platforms.');
  }
  const platforms = registry.platforms.map(validatePlatform);
  const ids = platforms.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error('platform registry ids must be unique.');
  return { schemaVersion: 1, platforms };
}

export function validateReleaseIntent(intent, registry, packageVersion) {
  if (intent?.schemaVersion !== 1) throw new Error('release intent schemaVersion must be 1.');
  const version = requireVersion(intent.version, 'release intent version');
  if (version !== packageVersion) throw new Error('release intent version must match package.json version.');
  const selectedPlatforms = requireStringArray(intent.selectedPlatforms, 'release intent selectedPlatforms');
  const platforms = new Map(registry.platforms.map((platform) => [platform.id, platform]));
  for (const id of selectedPlatforms) {
    const platform = platforms.get(id);
    if (!platform) throw new Error(`release intent selects unknown platform ${id}.`);
    if (platform.status !== 'active') throw new Error(`release intent cannot select retired platform ${id}.`);
  }
  const basis = intent.scopeBasis;
  if (!basis || typeof basis !== 'object' || Array.isArray(basis)) {
    throw new Error('release intent scopeBasis must map every selected platform to its evidence.');
  }
  if (Object.keys(basis).sort().join(',') !== [...selectedPlatforms].sort().join(',')) {
    throw new Error('release intent scopeBasis must exactly match selectedPlatforms.');
  }
  const scopeBasis = Object.fromEntries(selectedPlatforms.map((id) => [
    id, requireString(basis[id], `release intent scopeBasis.${id}`)
  ]));
  return { schemaVersion: 1, version, selectedPlatforms, scopeBasis };
}

export function resolveReleasePlatformIdentity({ registry: inputRegistry, intent: inputIntent, packageVersion, sha }) {
  const registry = validatePlatformRegistry(inputRegistry);
  const intent = validateReleaseIntent(inputIntent, registry, packageVersion);
  const activePlatforms = registry.platforms.filter(({ status }) => status === 'active');
  const hardGatePlatforms = activePlatforms.filter(({ t7Required }) => t7Required).map(({ id }) => id);
  const updaterBaselines = Object.fromEntries(activePlatforms.map(({ id, update }) => [
    id, update.mode === 'electron-updater' ? update.baselineVersion : ''
  ]));
  const managedAssets = registry.platforms
    .filter(({ id }) => intent.selectedPlatforms.includes(id))
    .flatMap((platform) => platform.managedAssets.map((asset) => asset.replaceAll('{version}', intent.version)));
  const digest = createHash('sha256').update(JSON.stringify({ intent, registry, sha })).digest('hex');
  return { activePlatforms: activePlatforms.map(({ id }) => id), digest, hardGatePlatforms, intent, managedAssets, registry, updaterBaselines };
}

export function assertReleaseIntentDigest(identity, expectedDigest) {
  if (expectedDigest && identity.digest !== expectedDigest) {
    throw new Error('release intent changed after release identity was frozen.');
  }
  return identity;
}

export function formatReleaseConfirmation(identity) {
  const names = new Map(identity.registry.platforms.map((platform) => [platform.id, platform.displayName]));
  return [
    `Version: ${identity.intent.version}`,
    `Platforms: ${identity.intent.selectedPlatforms.map((id) => names.get(id)).join(', ')}`,
    `Assets: ${identity.managedAssets.join(', ')}`
  ].join('\n');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalJson(entry)]));
}

export function assertPublishedRecordMapImmutable(previousRecords, nextRecords, label) {
  for (const [version, record] of Object.entries(previousRecords ?? {})) {
    if (JSON.stringify(canonicalJson(nextRecords?.[version])) !== JSON.stringify(canonicalJson(record))) {
      throw new Error(`published ${label} ${version} is immutable.`);
    }
  }
}

export function assertPublishedReleaseHistoryImmutable(previousManifest, nextManifest) {
  const next = new Map((nextManifest?.releases ?? []).map((entry) => [entry.version, entry]));
  for (const entry of previousManifest?.releases ?? []) {
    if (JSON.stringify(canonicalJson(next.get(entry.version))) !== JSON.stringify(canonicalJson(entry))) {
      throw new Error(`published release ${entry.version} notes and platform applicability are immutable.`);
    }
  }
}
