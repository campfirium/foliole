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
