import { Buffer } from 'node:buffer';

import { createCheck } from './release-doctor-core.mjs';

export const DOWNLOADS_URL = 'https://campfirium.github.io/foliole/releases/downloads.json';
export const PRODUCTION_SITE_URL = 'https://foliole.app/';

async function fetchText(url) {
  const response = await globalThis.fetch(url, { headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.text();
}

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

function checkDeploymentJobs(run, rootDir, commandRunner) {
  const result = commandRunner('gh', [
    'run', 'view', String(run?.databaseId ?? ''), '--repo', 'campfirium/foliole-site', '--json', 'jobs'
  ], rootDir);
  if (result.error || result.status !== 0) {
    return createCheck('FAIL', 'site production deployment', 'site deployment jobs could not be verified.');
  }
  const jobs = parseJsonResult(result)?.jobs ?? [];
  const required = ['build', 'deploy', 'deploy-origin'];
  const incomplete = required.filter((name) => jobs.find((job) => job?.name === name)?.conclusion !== 'success');
  return createCheck(
    incomplete.length === 0 ? 'PASS' : 'FAIL', 'site production deployment',
    incomplete.length === 0
      ? 'site build, Pages deployment, and production origin deployment all succeeded.'
      : `site jobs did not succeed: ${incomplete.join(', ')}.`
  );
}

async function checkProductionDownloads(expected, productionFetcher) {
  try {
    const html = await productionFetcher(PRODUCTION_SITE_URL);
    const urls = Object.values(expected?.platforms ?? {})
      .filter((platform) => platform?.status === 'available')
      .map((platform) => platform.url);
    const missing = urls.filter((url) => !html.includes(url));
    const current = missing.length === 0 && urls.length > 0;
    return createCheck(
      current ? 'PASS' : 'FAIL', 'site production downloads',
      current
        ? 'foliole.app exposes every verified platform download.'
        : `foliole.app is missing ${missing.length || 'all'} verified platform download(s).`
    );
  } catch (error) {
    return createCheck('FAIL', 'site production downloads', `foliole.app could not be verified: ${error.message}`);
  }
}

export async function checkSiteSync(version, rootDir, commandRunner, fetcher, productionFetcher = fetchText) {
  const run = commandRunner('gh', [
    'run', 'list', '--repo', 'campfirium/foliole-site', '--workflow', 'deploy.yml',
    '--event', 'repository_dispatch', '--limit', '1', '--json', 'databaseId,conclusion,url,createdAt'
  ], rootDir);
  if (run.error || run.status !== 0) return [commandFailure(run, 'site release sync run')];
  const latestRun = parseJsonResult(run)?.[0];
  const checks = [createCheck(
    latestRun?.conclusion === 'success' ? 'PASS' : 'FAIL', 'site release sync run',
    latestRun
      ? `latest repository_dispatch concluded ${latestRun.conclusion || '<pending>'}: ${latestRun.url ?? '<no url>'}`
      : 'no repository_dispatch deployment run was found.'
  )];
  if (latestRun) checks.push(checkDeploymentJobs(latestRun, rootDir, commandRunner));
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
    checks.push(await checkProductionDownloads(expected, productionFetcher));
  } catch (error) {
    checks.push(createCheck('UNKNOWN', 'site download manifest', `Pages download directory unavailable: ${error.message}`));
  }
  return checks;
}
