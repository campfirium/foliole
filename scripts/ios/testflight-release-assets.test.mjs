// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { assembleReleaseAssets } from '../release-assembly-assets.mjs';
import { resolveReleasePlatformIdentity } from '../release-platform-contract.mjs';
import { IOS_APP_ID, IOS_GROUP_ID, IOS_INVITATION } from './testflight-candidate.mjs';

let root;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
it.each([[['ios']], [['linux', 'ios']]])('assembles %s and rejects a different accepted iPhone source', async (scope) => {
  const registry = JSON.parse(await readFile('.github/release-platforms.json', 'utf8'));
  const version = '0.7.18';
  const sha = 'a'.repeat(40);
  const identity = resolveReleasePlatformIdentity({ registry, sha, packageVersion: version,
    intent: { schemaVersion: 1, version, publicationMode: 'scoped', selectedPlatforms: scope,
      scopeBasis: Object.fromEntries(scope.map(id => [id, 'Selected platform release'])) } });
  await mkdir('.tmp/artifacts', { recursive: true });
  root = await mkdtemp(path.resolve('.tmp/artifacts/testflight-assets-'));
  const inputRoot = path.join(root, 'input');
  const outputRoot = path.join(root, 'output');
  await mkdir(path.join(inputRoot, 'ios'), { recursive: true });
  const name = `Foliole-iOS-${version}-TestFlight.json`;
  const receipt = { schemaVersion: 1, version, sourceSha: sha, acceptedSha: sha, runId: '123',
    buildNumber: '321.2', ipaSha256: 'b'.repeat(64), appId: IOS_APP_ID, groupId: IOS_GROUP_ID,
    invitationUrl: IOS_INVITATION, buildId: 'build-id', channel: 'testflight',
    externalBuildState: 'WAITING_FOR_BETA_REVIEW' };
  await writeFile(path.join(inputRoot, 'ios', name), JSON.stringify(receipt));
  if (scope.includes('linux')) await writeLinux(inputRoot, version);
  expect(new Set(await assembleReleaseAssets({ identity, inputRoot, outputRoot }))).toEqual(new Set(identity.managedAssets));
  expect(JSON.parse(await readFile(path.join(outputRoot, name), 'utf8'))).toEqual(receipt);
  const other = 'c'.repeat(40);
  await writeFile(path.join(inputRoot, 'ios', name), JSON.stringify({ ...receipt, sourceSha: other, acceptedSha: other }));
  await expect(assembleReleaseAssets({ identity, inputRoot, outputRoot })).rejects.toThrow(/selected candidate/);
});

async function writeLinux(inputRoot, version) {
  const directory = path.join(inputRoot, 'linux');
  await mkdir(directory);
  const names = [`Foliole-Linux-Experimental-amd64-${version}.deb`,
    `Foliole-Linux-Experimental-amd64-${version}.AppImage`];
  const checksum = createHash('sha256').update('package').digest('hex');
  for (const name of names) await writeFile(path.join(directory, name), 'package');
  await writeFile(path.join(directory, 'SHA256SUMS.txt'), names.map(name => `${checksum} *${name}\n`).join(''));
}
