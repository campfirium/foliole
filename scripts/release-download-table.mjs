import { assertExactReleaseAssets } from './release-asset-contract.mjs';
import { createPlatformDownloadDirectory, currentPlatformRelease, platformDownloadAddress } from './release-download-directory.mjs';
import { IOS_INVITATION } from './ios/testflight-candidate.mjs';

const labels = { macos: 'Apple Silicon', windows: 'x64', linux: 'x64 .deb', android: 'APK' };

function platformLinks(platform, entry, release) {
  if (entry.status !== 'available') return [];
  const links = [{ label: `${entry.version} · ${labels[platform.id] ?? platform.architectures.join(', ')}`, url: entry.url }];
  if (platform.id === 'linux') {
    const asset = platform.managedAssets.find(name => name.endsWith('.AppImage'))?.replaceAll('{version}', entry.version);
    if (!asset || !release.assets?.some(item => item.name === asset)) throw new Error('Linux AppImage download asset is missing');
    links.push({ label: `${entry.version} · x64 AppImage`, url: `https://github.com/campfirium/foliole/releases/download/v${entry.version}/${asset}` });
  }
  return links;
}

export function createReleaseDownloadTable({ identity, manifest, candidate, publishedReleases }) {
  const { registry, intent } = identity;
  if (candidate?.tag_name !== `v${intent.version}` || candidate.draft !== true || candidate.target_commitish !== identity.sourceSha) {
    throw new Error('Download preview requires the exact unpublished Draft and source');
  }
  assertExactReleaseAssets(identity, (candidate.assets ?? []).map(asset => asset.name));
  const selected = new Set(intent.selectedPlatforms);
  const previous = createPlatformDownloadDirectory({ manifest, publishedReleases,
    registry: { ...registry, platforms: registry.platforms.filter(platform => !selected.has(platform.id)) } });
  const columns = registry.platforms.filter(platform => platform.status === 'active').map(platform => {
    if (platform.deliveryChannel === 'testflight') {
      return { header: platform.displayName, links: [{ label: 'TestFlight', url: IOS_INVITATION }] };
    }
    if (platform.deliveryChannel !== 'github-release') throw new Error('Unsupported release download channel');
    const entry = selected.has(platform.id) ? { ...platformDownloadAddress(platform, intent.version), status: 'available' } : previous.platforms[platform.id];
    const release = selected.has(platform.id) ? candidate : publishedReleases[currentPlatformRelease(manifest, platform.id)?.version];
    return { header: platform.displayName, version: entry?.status === 'available' ? entry.version : undefined,
      links: platformLinks(platform, entry, release) };
  });
  const row = values => `| ${values.join(' | ')} |`;
  const table = ['### Download', '', row(columns.map(column => column.header)), row(columns.map(() => '---')),
    row(columns.map(column => column.links.map(link => `[${link.label}](${link.url})`).join(' · ') || 'Not available'))].join('\n');
  return { columns, table };
}

export function assertReleaseDownloadTable(body, expected) {
  const sections = String(body).split(/^### Download\s*$/mu);
  if (sections.length !== 2 || /^#{1,3} /mu.test(sections[1])) throw new Error('Release body must end with one complete Download section');
  const section = sections[1];
  const headers = section.split('\n').find(line => line.trim().startsWith('|'))?.split('|').map(value => value.trim()) ?? [];
  if (expected.columns.some(column => !headers.includes(column.header))) throw new Error('Download table must list every active platform');
  const actual = [...section.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/gu)].map(match => ({ label: match[1], url: match[2] }));
  const required = expected.columns.flatMap(column => column.links.map(link => ({ ...link, version: column.version })));
  if (actual.length !== required.length || required.some(link => !actual.some(item => item.url === link.url &&
    (!link.version || item.label.includes(link.version))))) throw new Error('Download table links or visible platform versions differ from the verified candidate and published history');
  return body;
}
