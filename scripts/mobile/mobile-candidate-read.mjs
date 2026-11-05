import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readReceipt } from '../quality/chain-verdict-read.mjs';
import { createPlayRegistration } from './mobile-candidate-provenance.mjs';
import { readPlayDexIdentity } from '../android/play-dex-identity.mjs';

export function readSignedPlayArchive(bytes) {
  return extractSignedPlayArchive(bytes).candidate;
}

export function extractSignedPlayArchive(bytes) {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/mobile-candidate-read-'));
  try {
    const archive = path.join(root, 'signed.zip'); fs.writeFileSync(archive, bytes);
    const member = (name, maxBuffer = 512 * 1024 * 1024) => execFileSync('unzip', ['-p', archive, name], { maxBuffer });
    const candidate = JSON.parse(member('candidate.json', 1024 * 1024).toString('utf8'));
    const bundle = member('app-release-signed.aab');
    if (createHash('sha256').update(bundle).digest('hex') !== candidate.aabSha256) {
      throw new Error('Signed Play archive digest differs from the original candidate');
    }
    const bundleFile = path.join(root, 'signed.aab'); fs.writeFileSync(bundleFile, bundle);
    return { candidate: { ...candidate, dexSha256: readPlayDexIdentity(bundleFile, true) }, bundle };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

export async function allPages(api, route, field) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const result = await api('GET', `${route}?per_page=100&page=${page}`);
    if (!Array.isArray(result?.[field]) || !Number.isSafeInteger(result.total_count)) throw new Error('Mobile provenance inventory is incomplete');
    rows.push(...result[field]);
    if (rows.length >= result.total_count) return rows;
    if (!result[field].length) throw new Error('Mobile provenance inventory ended early');
  }
}

export async function readPlayRegistration(api, { runId, artifactName, registrarSha }) {
  if (!/^[1-9]\d*$/u.test(String(runId)) ||
      !new RegExp(`^android-play-${runId}-[1-9]\\d*-signed$`, 'u').test(artifactName ?? '')) {
    throw new Error('Exact original signed Play artifact and run are required');
  }
  const route = `actions/runs/${runId}`;
  const run = await api('GET', route);
  const artifacts = await allPages(api, `${route}/artifacts`, 'artifacts');
  const signed = artifacts.filter(item => item.name === artifactName && !item.expired);
  if (signed.length !== 1) throw new Error('Original signed Play checkpoint is missing or expired');
  const signedArtifact = signed[0];
  const attempt = Number(artifactName.split('-').at(-2));
  const qualityArtifacts = artifacts.map(item => ({ item,
    attempt: Number(item.name.match(new RegExp(`^chain-verdict-${runId}-([1-9]\\d*)$`, 'u'))?.[1]) }))
    .filter(row => row.attempt && row.attempt <= attempt && !row.item.expired)
    .sort((left, right) => right.attempt - left.attempt);
  const qualityArtifact = qualityArtifacts[0]?.item;
  if (!qualityArtifact || !Number.isSafeInteger(signedArtifact.id) || !Number.isSafeInteger(qualityArtifact.id)) {
    throw new Error('Original full quality checkpoint is missing');
  }
  const archive = async artifact => {
    const bytes = await api('GET', `actions/artifacts/${artifact.id}/zip`, undefined, true);
    if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== artifact.digest) {
      throw new Error('Downloaded mobile checkpoint digest differs from GitHub metadata');
    }
    return bytes;
  };
  const candidate = readSignedPlayArchive(await archive(signedArtifact));
  const quality = readReceipt(await archive(qualityArtifact));
  if (!Number.isSafeInteger(quality.run_attempt) || quality.run_attempt < 1 ||
      !/^[a-f\d]{40}$/u.test(run.head_sha ?? '')) throw new Error('Quality attempt or source is invalid');
  const jobs = await allPages(api, `${route}/attempts/${quality.run_attempt}/jobs`, 'jobs');
  if (attempt !== quality.run_attempt) jobs.push(...await allPages(api, `${route}/attempts/${attempt}/jobs`, 'jobs'));
  const sourcePackage = await api('GET', `contents/package.json?ref=${run.head_sha}`);
  if (sourcePackage.encoding !== 'base64') throw new Error('Source package metadata is unavailable');
  if (JSON.parse(Buffer.from(sourcePackage.content, 'base64').toString()).version !== candidate.version) {
    throw new Error('Candidate version differs from actual source package');
  }
  const latest = await api('GET', route);
  if (latest.head_sha !== run.head_sha || latest.run_attempt !== run.run_attempt) throw new Error('Source run changed during registration');
  return createPlayRegistration({ run: latest, candidate, signedArtifact, qualityArtifact, quality, jobs, registrarSha });
}
