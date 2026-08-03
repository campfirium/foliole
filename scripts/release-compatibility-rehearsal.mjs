/* global structuredClone */

import { assertExactReleaseAssets } from './release-asset-contract.mjs';
import { createPlatformDownloadDirectory } from './release-download-directory.mjs';
import { assertLocalizedReleaseNotesScope } from './release-notes-contract.mjs';
import {
  assertPublishedReleaseHistoryImmutable,
  resolveReleasePlatformIdentity
} from './release-platform-contract.mjs';
import { assertPublishedManifestScope, resolveReleasePublication } from './release-publication-contract.mjs';

const REPOSITORY = 'campfirium/foliole';

function sameMembers(left, right) {
  return [...left].sort().join(',') === [...right].sort().join(',');
}

function releaseUrl(version) {
  return `https://github.com/${REPOSITORY}/releases/tag/v${version}`;
}

function requireAllProducers(identity, producerPlatforms) {
  if (!sameMembers(identity.hardGatePlatforms, producerPlatforms)) {
    throw new Error('rehearsal must pass every active T7 producer before publication.');
  }
}

function publicationRelease(step) {
  return {
    assets: step.assets.map((name) => ({ name })),
    draft: false,
    published_at: '2026-08-03T00:00:00Z',
    tag_name: `v${step.version}`
  };
}

function nextManifest(previous, identity, publication) {
  const entry = {
    platforms: identity.intent.selectedPlatforms,
    url: releaseUrl(identity.intent.version),
    version: identity.intent.version
  };
  return {
    ...structuredClone(previous),
    desktopUpdater: {
      ...structuredClone(previous.desktopUpdater),
      compatibilityBridgeVersion: publication.bridgeVersion
    },
    latest: identity.intent.version,
    releases: [entry, ...(previous.releases ?? [])]
  };
}

export function applyIsolatedReleaseStep(previousState, registry, step) {
  const intent = {
    publicationMode: step.publicationMode,
    schemaVersion: 1,
    scopeBasis: Object.fromEntries(step.selectedPlatforms.map((id) => [id, `${id} rehearsal evidence.`])),
    selectedPlatforms: step.selectedPlatforms,
    version: step.version
  };
  const identity = resolveReleasePlatformIdentity({
    intent, packageVersion: step.version, registry, sha: step.sha
  });
  requireAllProducers(identity, step.producerPlatforms);
  const publication = resolveReleasePublication(identity, previousState.manifest);
  assertExactReleaseAssets(identity, step.assets);
  assertLocalizedReleaseNotesScope({ en: { [step.version]: step.notes } }, identity, step.version);
  const manifest = nextManifest(previousState.manifest, identity, publication);
  assertPublishedReleaseHistoryImmutable(previousState.manifest, manifest);
  assertPublishedManifestScope({ identity, manifest, previousManifest: previousState.manifest });
  const publishedReleases = {
    ...structuredClone(previousState.publishedReleases),
    [step.version]: publicationRelease(step)
  };
  const downloads = createPlatformDownloadDirectory({ manifest, publishedReleases, registry });
  const next = {
    downloads,
    githubLatestVersion: publication.makeLatest ? step.version : previousState.githubLatestVersion,
    manifest,
    notes: { ...structuredClone(previousState.notes), [step.version]: step.notes },
    publishedReleases
  };
  auditCompatibilityRehearsal(next, registry);
  return next;
}

export function resolveRehearsalPlatformVersion(state, platform) {
  return state.downloads?.platforms?.[platform]?.version ?? null;
}

export function auditCompatibilityRehearsal(state, registry) {
  const bridge = state.manifest.desktopUpdater?.compatibilityBridgeVersion;
  if (!bridge || state.githubLatestVersion !== bridge) {
    throw new Error('legacy GitHub-provider clients must remain on the compatibility bridge.');
  }
  const rebuilt = createPlatformDownloadDirectory({
    manifest: state.manifest,
    publishedReleases: state.publishedReleases,
    registry
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(state.downloads)) {
    throw new Error('rehearsal website directory must match the verified manifest and assets.');
  }
  for (const platform of registry.platforms.filter(({ status }) => status === 'active')) {
    const current = resolveRehearsalPlatformVersion(state, platform.id);
    if (!current) throw new Error(`${platform.id} must retain an installable release.`);
    const release = state.publishedReleases[current];
    const asset = platform.downloadAsset.replaceAll('{version}', current);
    if (!release.assets.some(({ name }) => name === asset)) {
      throw new Error(`${platform.id} current release is missing its website asset.`);
    }
  }
  return true;
}

export function createCompatibilityBridgePinnedInput(registry, version) {
  const selectedPlatforms = registry.platforms.filter(({ status }) => status === 'active').map(({ id }) => id);
  return {
    publicationMode: 'bridge',
    requiresPinnedReleaseAgent: true,
    requiresUserPublicationConfirmation: true,
    selectedPlatforms,
    version
  };
}
