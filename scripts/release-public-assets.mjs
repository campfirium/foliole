import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { publicAssetTemplates } from './release-platform-contract.mjs';

export function assertPublishedReleaseAssets(identity, names) {
  // Previously published CI receipts may be removed independently of download assets.
  const receipts = new Set(identity.registry.platforms.flatMap(platform => platform.managedAssets
    .filter(asset => !publicAssetTemplates(platform).includes(asset))
    .map(asset => asset.replaceAll('{version}', identity.intent.version))));
  const actual = names.filter(name => !receipts.has(name)).sort();
  const expected = [...identity.managedAssets].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('published release assets differ from intent');
}

export async function verifyPublishedAssetBytes({ directory, identity, release }) {
  if (release.draft !== false || !release.published_at || release.tag_name !== `v${identity.intent.version}` ||
      release.target_commitish !== identity.sourceSha) throw new Error('Published asset verification requires the exact public Release');
  assertPublishedReleaseAssets(identity, release.assets.map(asset => asset.name));
  for (const name of identity.managedAssets) {
    const asset = release.assets.find(item => item.name === name);
    const bytes = await readFile(path.join(directory, name));
    if (asset.size !== bytes.length || asset.digest !== `sha256:${createHash('sha256').update(bytes).digest('hex')}`) {
      throw new Error(`published asset digest or size differs: ${name}`);
    }
  }
}
