import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PLAY_PACKAGE } from './play-api.mjs';
import { PLAY_APP_CERTIFICATE_SHA256 } from './play-generated-apk.mjs';
import { readPlayDexIdentity, verifyPlayDexIdentity } from './play-dex-identity.mjs';

export async function verifyPlayReleaseAssets(directory, version, sha, receiptDirectory = directory) {
  const receipt = JSON.parse(await readFile(path.join(receiptDirectory, `Foliole-Android-${version}-Play.json`), 'utf8'));
  const asset = `Foliole-Android-${version}.apk`;
  const lifecycle = ['IN_REVIEW', 'APPROVED_NOT_PUBLISHED', 'PUBLISHED'].map(state => `RELEASE_LIFECYCLE_STATE_${state}`);
  if (receipt.schemaVersion !== 1 || receipt.sourceSha !== sha || receipt.acceptedSha !== sha ||
      !/^[a-f\d]{40}$/u.test(sha ?? '') || receipt.version !== version || receipt.packageName !== PLAY_PACKAGE ||
      receipt.asset !== asset || receipt.channel !== 'play-beta' || receipt.certificateSha256 !== PLAY_APP_CERTIFICATE_SHA256 ||
      !Number.isSafeInteger(receipt.versionCode) || receipt.versionCode <= 2 ||
      !Number.isSafeInteger(receipt.deploymentId) || receipt.deploymentId < 1 || !/^[1-9]\d*$/u.test(receipt.runId ?? '') ||
      receipt.releaseName !== `${version}.${receipt.versionCode}.${sha.slice(0, 9)}` ||
      !lifecycle.includes(receipt.releaseLifecycleState) || !/^[a-f\d]{64}$/u.test(receipt.aabSha256 ?? '')) {
    throw new Error('Android release receipt does not match the exact Play candidate');
  }
  const file = path.join(directory, asset);
  const bytes = await readFile(file);
  if (createHash('sha256').update(bytes).digest('hex') !== receipt.apkSha256 || bytes.length !== receipt.size) {
    throw new Error('Android release APK digest or size differs');
  }
  verifyPlayDexIdentity(readPlayDexIdentity(file), receipt.dexSha256);
  return receipt;
}
