import { Buffer } from 'node:buffer';

import { createCheck } from './release-doctor-core.mjs';

export const DOWNLOADS_URL = 'https://campfirium.github.io/foliole/releases/downloads.json';

function parseJsonResult(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function commandFailure(result, title) {
  if (result.error?.code === 'ENOENT') return createCheck('SKIPPED', title, 'gh is not installed.');
  return createCheck('UNKNOWN', title,
    (result.stderr || result.stdout || result.error?.message || 'GitHub check failed.').trim());
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalJson(entry)]));
}

export async function checkSiteSync(version, rootDir, commandRunner, fetcher) {
  const run = commandRunner('gh', [
    'run', 'list', '--repo', 'campfirium/foliole-site', '--workflow', 'deploy.yml',
    '--event', 'repository_dispatch', '--limit', '1', '--json', 'conclusion,url,createdAt'
  ], rootDir);
  if (run.error || run.status !== 0) return [commandFailure(run, 'site release sync run')];
  const latestRun = parseJsonResult(run)?.[0];
  const checks = [createCheck(
    latestRun?.conclusion === 'success' ? 'PASS' : 'FAIL', 'site release sync run',
    latestRun
      ? `latest repository_dispatch concluded ${latestRun.conclusion || '<pending>'}: ${latestRun.url ?? '<no url>'}`
      : 'no repository_dispatch deployment run was found.'
  )];
  const manifest = commandRunner('gh', [
    'api', 'repos/campfirium/foliole-site/contents/content/downloads.json?ref=main', '--jq', '.content'
  ], rootDir);
  if (manifest.error || manifest.status !== 0) {
    checks.push(commandFailure(manifest, 'site download manifest'));
    return checks;
  }
  let published;
  try {
    published = JSON.parse(Buffer.from(manifest.stdout.trim(), 'base64').toString('utf8'));
  } catch {
    published = null;
  }
  try {
    const expected = await fetcher(DOWNLOADS_URL);
    const current = JSON.stringify(canonicalJson(published)) === JSON.stringify(canonicalJson(expected));
    checks.push(createCheck(current ? 'PASS' : 'FAIL', 'site download manifest', current
      ? `site download manifest exactly matches the verified ${version} platform directory.`
      : 'site download manifest has missing, extra, or incorrect platform download data.'));
  } catch (error) {
    checks.push(createCheck('UNKNOWN', 'site download manifest', `Pages download directory unavailable: ${error.message}`));
  }
  return checks;
}
