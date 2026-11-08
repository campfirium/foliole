/* global fetch, AbortSignal */
import { createHash } from 'node:crypto';

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

export async function readPublicReleaseInventory({ fetchImpl = fetch, repository, token }) {
  let androidApk;
  const changelog = [];
  for (let page = 1; ; page += 1) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      redirect: 'error', signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Public Release lookup failed with HTTP ${response.status}.`);
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error('Public Release inventory is invalid.');
    for (const release of releases) {
      const tag = release?.tag_name;
      if (release?.draft === false && release.published_at && !release.prerelease && tag !== 'demo') {
        changelog.push([tag, release.published_at, release.updated_at, release.body]);
      }
      if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(tag) ||
          release.draft !== false || !release.published_at ||
          !(release.assets ?? []).some(asset => asset.name === `Foliole-Android-${tag.slice(1)}.apk` &&
            /^sha256:[0-9a-f]{64}$/u.test(asset.digest ?? '') && asset.state === 'uploaded')) continue;
      if (!androidApk || compareVersions(tag.slice(1), androidApk.tag_name.slice(1)) > 0) androidApk = release;
    }
    if (releases.length < 100) {
      changelog.sort(([left], [right]) => left.localeCompare(right));
      const changelogRevision = createHash('sha256').update(JSON.stringify(changelog)).digest('hex');
      return { androidApk, changelogRevision };
    }
  }
}
