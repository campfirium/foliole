const REPOSITORY = 'campfirium/foliole';

function compareVersions(left, right) {
  const parse = (value) => value.split('.').map((part) => Number.parseInt(part, 10));
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function currentPlatformRelease(manifest, platformId) {
  return [...(manifest.releases ?? [])]
    .filter((release) => release.platforms?.includes(platformId))
    .sort((left, right) => compareVersions(right.version, left.version))[0] ?? null;
}

export function listPlatformDownloadVersions(manifest, registry) {
  return [...new Set(registry.platforms
    .filter((platform) => platform.status === 'active' && platform.deliveryChannel === 'github-release')
    .map((platform) => currentPlatformRelease(manifest, platform.id)?.version)
    .filter(Boolean))];
}

function availableDownload(platform, release, publishedRelease, repository) {
  if (!platform.downloadAsset) throw new Error(`${platform.id} has no website download asset contract.`);
  const tag = `v${release.version}`;
  if (publishedRelease?.draft !== false || !publishedRelease?.published_at || publishedRelease?.tag_name !== tag) {
    throw new Error(`${platform.id} download must come from published Release ${tag}.`);
  }
  const asset = platform.downloadAsset.replaceAll('{version}', release.version);
  if (!(publishedRelease.assets ?? []).some((entry) => entry?.name === asset)) {
    throw new Error(`${platform.id} download asset ${asset} is missing from ${tag}.`);
  }
  return platformDownloadAddress(platform, release.version, repository);
}

export function platformDownloadAddress(platform, version, repository = REPOSITORY) {
  const tag = `v${version}`;
  const asset = platform.downloadAsset.replaceAll('{version}', version);
  return {
    architectures: platform.architectures,
    asset,
    channel: platform.deliveryChannel,
    releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`,
    status: 'available',
    tag,
    url: `https://github.com/${repository}/releases/download/${tag}/${asset}`,
    version
  };
}

export function createPlatformDownloadDirectory({ manifest, publishedReleases, registry, repository = REPOSITORY }) {
  // Store invitations are maintained separately from exact GitHub installer assets.
  const platforms = Object.fromEntries(registry.platforms.filter((platform) =>
    platform.deliveryChannel === 'github-release').map((platform) => {
    if (platform.status === 'retired') {
      return [platform.id, {
        archiveUrl: platform.retirement.archiveUrl,
        channel: platform.deliveryChannel,
        reason: platform.retirement.reason,
        status: 'retired',
        version: platform.retirement.lastPublicVersion
      }];
    }
    const release = currentPlatformRelease(manifest, platform.id);
    if (!release) return [platform.id, { channel: platform.deliveryChannel, status: 'unavailable' }];
    return [platform.id, availableDownload(platform, release, publishedReleases[release.version], repository)];
  }));
  return {
    allReleasesUrl: `https://github.com/${repository}/releases`,
    productVersion: manifest.latest,
    schemaVersion: 1,
    platforms
  };
}
