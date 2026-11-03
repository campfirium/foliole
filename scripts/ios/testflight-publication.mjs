/* global AbortSignal, fetch, process */
import { Buffer } from 'node:buffer';
import { createPrivateKey, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyTestflightReceipt, IOS_APP_ID, IOS_GROUP_ID } from './testflight-candidate.mjs';

function encode(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }

export async function appleReadToken(env = process.env) {
  const keyId = env.APPLE_API_KEY_ID;
  const issuer = env.APPLE_API_ISSUER;
  const pem = env.APPLE_API_KEY ? await readFile(env.APPLE_API_KEY) :
    Buffer.from(env.APPLE_NOTARY_API_KEY_BASE64 ?? '', 'base64');
  if (!keyId || !issuer || !pem.length) throw new Error('Apple API credentials are required to confirm iPhone availability');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({
    iss: issuer, iat: now, exp: now + 300, aud: 'appstoreconnect-v1'
  })}`;
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363'
  }).toString('base64url');
  return `${unsigned}.${signature}`;
}

export function assertApprovedTestflightBuild(result, receipt) {
  const build = result?.data;
  const related = (name) => result?.included?.find((item) =>
    item.id === build?.relationships?.[name]?.data?.id &&
    item.type === build?.relationships?.[name]?.data?.type);
  const version = related('preReleaseVersion');
  const beta = related('buildBetaDetail');
  const groups = build?.relationships?.betaGroups?.data ?? [];
  if (build?.type !== 'builds' || build.id !== receipt.buildId ||
      build.attributes?.version !== receipt.buildNumber ||
      build.relationships?.app?.data?.id !== IOS_APP_ID ||
      version?.attributes?.version !== receipt.version || version?.attributes?.platform !== 'IOS') {
    throw new Error('Apple availability evidence refers to another iPhone candidate');
  }
  if (build.attributes.processingState !== 'VALID' || build.attributes.expired ||
      !['BETA_APPROVED', 'READY_FOR_BETA_TESTING', 'IN_BETA_TESTING'].includes(beta?.attributes?.externalBuildState) ||
      beta?.attributes?.autoNotifyEnabled !== true || !groups.some((group) => group.id === IOS_GROUP_ID)) {
    throw new Error('iPhone candidate is not approved and available to its external group yet');
  }
}

export async function assertIosReleaseAvailable({ identity, cwd, tag, run, fetchImpl = fetch }) {
  if (!identity.intent.selectedPlatforms.includes('ios')) return;
  await mkdir(path.join(cwd, '.tmp/artifacts'), { recursive: true });
  const directory = await mkdtemp(path.join(cwd, '.tmp/artifacts/testflight-publication-'));
  const name = `Foliole-iOS-${identity.intent.version}-TestFlight.json`;
  run('gh', ['release', 'download', tag, '-R', 'campfirium/foliole', '--pattern', name, '--dir', directory],
    { cwd, encoding: 'utf8' });
  const sha = run('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const receipt = verifyTestflightReceipt(JSON.parse(await readFile(path.join(directory, name), 'utf8')),
    { version: identity.intent.version, sha });
  const token = await appleReadToken();
  const url = `https://api.appstoreconnect.apple.com/v1/builds/${encodeURIComponent(receipt.buildId)}` +
    '?include=app,preReleaseVersion,buildBetaDetail,betaGroups';
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` },
    redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Apple availability check failed (${response.status})`);
  assertApprovedTestflightBuild(await response.json(), receipt);
}
