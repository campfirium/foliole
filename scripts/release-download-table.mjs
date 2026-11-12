import { assertExactReleaseAssets } from './release-asset-contract.mjs';
import { createPlatformDownloadDirectory, currentPlatformRelease, platformDownloadAddress } from './release-download-directory.mjs';
import { IOS_INVITATION } from './ios/testflight-candidate.mjs';

const layout = {
  macos: ['macOS', 'Apple Silicon', 'DMG'],
  windows: ['Windows', 'x64', 'EXE'],
  linux: ['Linux (Experimental)', 'x64', 'DEB'],
  ios: ['iPhone', 'TestFlight'],
  android: ['Android', 'Open Testing', 'APK']
};

function platformLinks(platform, entry, release) {
  if (entry.status !== 'available') return [];
  const links = [{ label: layout[platform.id][2], url: entry.url }];
  if (platform.id === 'linux') {
    const asset = platform.managedAssets.find(name => name.endsWith('.AppImage'))?.replaceAll('{version}', entry.version);
    if (!asset || !release.assets?.some(item => item.name === asset)) throw new Error('Linux AppImage download asset is missing');
    links.push({ label: 'AppImage', url: `https://github.com/campfirium/foliole/releases/download/v${entry.version}/${asset}` });
  }
  return links;
}

export function createReleaseDownloadTable({ identity, manifest, candidate, publishedReleases, review = {} }) {
  const { registry, intent } = identity;
  if (candidate?.tag_name !== `v${intent.version}` || candidate.draft !== true || candidate.target_commitish !== identity.sourceSha) {
    throw new Error('Download preview requires the exact unpublished Draft and source');
  }
  assertExactReleaseAssets(identity, (candidate.assets ?? []).map(asset => asset.name));
  const selected = new Set(intent.selectedPlatforms);
  const previous = createPlatformDownloadDirectory({ manifest, publishedReleases,
    registry: { ...registry, platforms: registry.platforms.filter(platform => !selected.has(platform.id)) } });
  const columns = Object.keys(layout).map(id => registry.platforms.find(platform => platform.id === id))
    .filter(platform => platform?.status === 'active').map(platform => {
    const [header, channel] = layout[platform.id];
    if (platform.deliveryChannel === 'testflight') {
      return { header, channel, version: selected.has(platform.id) ? intent.version : undefined,
        links: [{ label: 'TestFlight', url: IOS_INVITATION }],
        status: review.ios ? '(In Review)' : undefined };
    }
    if (platform.deliveryChannel !== 'github-release') throw new Error('Unsupported release download channel');
    const entry = selected.has(platform.id) ? { ...platformDownloadAddress(platform, intent.version), status: 'available' } : previous.platforms[platform.id];
    const release = selected.has(platform.id) ? candidate : publishedReleases[currentPlatformRelease(manifest, platform.id)?.version];
    return { header, channel, status: platform.id === 'android' && review.android ? 'Play (In Review)' : undefined,
      version: entry?.status === 'available' ? entry.version : undefined,
      links: platformLinks(platform, entry, release) };
  });
  return { columns, table: renderTable(columns) };
}

function renderTable(columns) {
  const row = values => `| ${values.join(' | ')} |`;
  const versions = columns.map(column => column.version);
  const rows = ['---', '', row(columns.map(column => `**${column.header}**`)), row(columns.map(() => ':---:')),
    row(columns.map(column => column.channel))];
  if (new Set(versions.filter(Boolean)).size > 1) rows.push(row(versions.map(version => version ?? '—')));
  rows.push(row(columns.map(column => [
    ...column.links.map(link => `[${link.label}](${link.url})`), column.status
  ].filter(Boolean).join(column.header === 'iPhone' ? ' ' : ' · ') || 'Not available')));
  return rows.join('\n');
}

export function assertReleaseDownloadTable(body, expected) {
  const actual = String(body).trim().split('\n').map(line => line.trim());
  const approved = expected.table.split('\n');
  const normalize = line => line.startsWith('|') ? line.split('|').map(cell => cell.trim()).join('|') : line;
  const tail = actual.slice(-approved.length).map(normalize);
  const allowed = approved.map(normalize);
  const android = expected.columns.findIndex(column => column.header === 'Android');
  if (android >= 0 && !expected.columns[android].status && expected.columns[android].links.length) {
    const cells = tail.at(-1).split('|');
    if (cells[android + 1]?.endsWith(' · Play (In Review)')) {
      cells[android + 1] = cells[android + 1].slice(0, -' · Play (In Review)'.length);
      tail[tail.length - 1] = cells.join('|');
    }
  }
  if (tail.some((line, index) => line !== allowed[index]) || tail.length !== allowed.length) {
    throw new Error('Download table must list every active platform with the verified layout, versions, and links');
  }
  return body;
}
