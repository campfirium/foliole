import { existsSync } from 'node:fs';
import { get } from 'node:https';
import { join } from 'node:path';

import { createCheck } from './release-doctor-core.mjs';
import { assertExactReleaseAssets } from './release-asset-contract.mjs';
import { resolveReleasePublication } from './release-publication-contract.mjs';
import { DOWNLOADS_URL } from './release-doctor-site.mjs';

export { checkSiteSync } from './release-doctor-site.mjs';

const MANIFEST_URL = 'https://campfirium.github.io/foliole/releases/update-manifest.json';
const MARKETING_ROOT = 'D:\\C\\foliole-marketing';

function parseJsonResult(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function normalizeBody(value) {
  return String(value ?? '').replaceAll('\r\n', '\n').trim();
}

function classifyGhFailure(result) {
  if (result.error?.code === 'ENOENT') {
    return createCheck('SKIPPED', 'GitHub release remote', 'gh is not installed.');
  }
  const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.toLowerCase();
  if (output.includes('authentication') || output.includes('not logged') || output.includes('login')) {
    return createCheck('SKIPPED', 'GitHub release remote', 'gh is not authenticated.');
  }
  return createCheck('UNKNOWN', 'GitHub release remote', `gh release check failed: ${(result.stderr || result.stdout || '').trim()}`);
}

function checkRemoteBody(candidateJson, localBody, phase) {
  if (phase !== 'post') {
    return [];
  }
  const remoteBody = normalizeBody(candidateJson?.body);
  const expectedBody = normalizeBody(localBody);
  if (!remoteBody) {
    return [createCheck('FAIL', 'GitHub release body remote', 'GitHub release body is empty.')];
  }
  return [createCheck(
    remoteBody === expectedBody ? 'PASS' : 'FAIL',
    'GitHub release body remote',
    remoteBody === expectedBody ? 'remote body matches reviewed local body.' : 'remote body differs from reviewed local body.'
  )];
}

function checkRemoteAssets(candidateJson, phase, identity) {
  if (phase !== 'post') {
    return [];
  }
  const assetNames = Array.isArray(candidateJson?.assets)
    ? candidateJson.assets.map((asset) => asset?.name ?? '')
    : [];
  try {
    assertExactReleaseAssets(identity, assetNames);
    return [createCheck('PASS', 'GitHub release scoped assets', 'remote assets exactly match release intent.')];
  } catch (error) {
    return [createCheck('FAIL', 'GitHub release scoped assets', error.message)];
  }
}

export function checkGithubReleaseSignals({
  commandRunner, identity, localBody, manifest, phase, rootDir, version
}) {
  const candidate = commandRunner('gh', ['release', 'view', `v${version}`, '-R', 'campfirium/foliole', '--json', 'body,isDraft,publishedAt,tagName,url,assets'], rootDir);
  if (candidate.error || candidate.status !== 0) {
    const missing = (candidate.stderr ?? '').toLowerCase().includes('not found');
    if (missing) {
      return [createCheck(phase === 'post' ? 'FAIL' : 'WARN', 'GitHub release remote', `v${version} was not found on GitHub; phase=${phase}.`)];
    }
    return [classifyGhFailure(candidate)];
  }
  const candidateJson = parseJsonResult(candidate);
  const isPublished = candidateJson?.isDraft === false && Boolean(candidateJson?.publishedAt);
  const checks = [
    createCheck(candidateJson?.tagName === `v${version}` ? 'PASS' : 'FAIL', 'GitHub release tag', `GitHub release tag is ${candidateJson?.tagName ?? '<unknown>'}.`),
    createCheck(
      phase === 'post' ? (isPublished ? 'PASS' : 'FAIL') : (candidateJson?.isDraft ? 'PASS' : 'WARN'),
      'GitHub release state',
      `GitHub release draft=${String(candidateJson?.isDraft)} publishedAt=${candidateJson?.publishedAt ?? '<none>'}; phase=${phase}.`
    ),
    ...checkRemoteBody(candidateJson, localBody, phase),
    ...checkRemoteAssets(candidateJson, phase, identity)
  ];
  const latest = commandRunner('gh', ['release', 'view', '-R', 'campfirium/foliole', '--json', 'tagName,isDraft,publishedAt,url'], rootDir);
  if (latest.error || latest.status !== 0) {
    checks.push(createCheck('UNKNOWN', 'GitHub latest release', `latest release check failed: ${(latest.stderr || latest.stdout || '').trim()}`));
    return checks;
  }
  const latestJson = parseJsonResult(latest);
  let expectedLatest;
  try {
    if (identity.intent.publicationMode === 'bridge') {
      expectedLatest = version;
    } else {
      const publication = resolveReleasePublication(identity, manifest);
      expectedLatest = publication.mode === 'scoped' ? publication.bridgeVersion : version;
    }
  } catch (error) {
    checks.push(createCheck('FAIL', 'GitHub latest release', error.message));
    return checks;
  }
  const latestMatches = latestJson?.tagName === `v${expectedLatest}`;
  checks.push(createCheck(latestMatches ? 'PASS' : (phase === 'post' ? 'FAIL' : 'WARN'), 'GitHub latest release', `GitHub latest is ${latestJson?.tagName ?? '<unknown>'}; expected v${expectedLatest}; phase=${phase}.`));
  return checks;
}

export async function fetchJson(url = MANIFEST_URL) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        resolve(JSON.parse(body));
      });
    }).on('error', reject);
  });
}

export async function checkOnlineManifest(version, identity, fetcher = fetchJson) {
  try {
    const manifest = await fetcher(MANIFEST_URL);
    const release = Array.isArray(manifest.releases) ? manifest.releases.find((entry) => entry?.version === version) : null;
    return [
      createCheck(manifest.latest === version ? 'PASS' : 'FAIL', 'Pages manifest latest', `online latest is ${manifest.latest ?? '<missing>'}.`),
      createCheck(release?.url === `https://github.com/campfirium/foliole/releases/tag/v${version}` ? 'PASS' : 'FAIL', 'Pages manifest release url', `online release URL is ${release?.url ?? '<missing>'}.`),
      createCheck(JSON.stringify([...(release?.platforms ?? [])].sort()) === JSON.stringify([...identity.intent.selectedPlatforms].sort()) ? 'PASS' : 'FAIL', 'Pages manifest release platforms', `online release platforms are ${(release?.platforms ?? []).join(',') || '<missing>'}.`)
    ];
  } catch (error) {
    return [createCheck('UNKNOWN', 'Pages manifest', `online manifest unavailable: ${error.message}`)];
  }
}

export async function checkOnlineDownloadDirectory(version, identity, fetcher = fetchJson) {
  try {
    const directory = await fetcher(DOWNLOADS_URL);
    const platformIds = Object.keys(directory?.platforms ?? {}).sort();
    const expectedIds = identity.registry.platforms.map(({ id }) => id).sort();
    const exactPlatforms = JSON.stringify(platformIds) === JSON.stringify(expectedIds);
    const selectedCurrent = identity.intent.selectedPlatforms.every((id) => {
      const entry = directory?.platforms?.[id];
      return entry?.status === 'available' && entry.version === version && entry.tag === `v${version}` &&
        entry.url === `https://github.com/campfirium/foliole/releases/download/v${version}/${entry.asset}`;
    });
    return [
      createCheck(exactPlatforms ? 'PASS' : 'FAIL', 'Pages download platforms', `online platform keys are ${platformIds.join(',') || '<missing>'}.`),
      createCheck(selectedCurrent ? 'PASS' : 'FAIL', 'Pages selected downloads', selectedCurrent
        ? `selected platforms point to exact v${version} assets.`
        : `selected platforms do not all point to exact v${version} assets.`)
    ];
  } catch (error) {
    return [createCheck('UNKNOWN', 'Pages download directory', `online downloads unavailable: ${error.message}`)];
  }
}

export function checkMarketingPosting(version, marketingRoot = MARKETING_ROOT) {
  if (!existsSync(marketingRoot)) {
    return createCheck('SKIPPED', 'marketing posting file', `marketing checkout is unavailable at ${marketingRoot}.`);
  }
  const postingPath = join(marketingRoot, 'change', `${version}.md`);
  if (!existsSync(postingPath)) {
    return createCheck('WARN', 'marketing posting file', `external posting todo: ${postingPath} is missing.`);
  }
  return createCheck('PASS', 'marketing posting file', `${postingPath} exists.`);
}

export async function collectPostPublishChecks({ fetcher, identity, marketingRoot, phase, version }) {
  if (phase !== 'post') {
    return [];
  }
  return [
    ...(await checkOnlineManifest(version, identity, fetcher)),
    ...(await checkOnlineDownloadDirectory(version, identity, fetcher)),
    checkMarketingPosting(version, marketingRoot)
  ];
}
