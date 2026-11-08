import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { IOS_INVITATION } from '../ios/testflight-candidate.mjs';
import { createMobileGithubApi } from './mobile-candidate-store.mjs';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';

const testflightLink = `[TestFlight](${IOS_INVITATION})`;
const reviewCell = `${testflightLink} (In Review)`;
const table = /(?:^\|[^\r\n]*\|[ \t]*(?:\r?\n|$))+/gmu;

function updateTable(block, version) {
  const lines = block.split(/(?<=\n)/u);
  const column = lines[0].split('|').findIndex(cell => ['iPhone', 'iPhone (TestFlight)'].includes(cell.trim()));
  if (column < 1) return block;
  const row = lines.findIndex((line, index) => index > 0 &&
    line.split('|')[column]?.trim() === reviewCell &&
    lines[index - 1].split('|')[column]?.trim() === version);
  if (row < 0) return block;
  const cells = lines[row].split('|');
  cells[column] = cells[column].replace(reviewCell, testflightLink);
  lines[row] = cells.join('|');
  return lines.join('');
}

async function releaseByTag(api, tag) {
  try {
    return await api('GET', `releases/tags/${tag}`);
  } catch (error) {
    if (error.message === 'GitHub candidate request failed (HTTP 404)') return undefined;
    throw error;
  }
}

export async function syncTestflightReleaseStatus(api, reviews) {
  const newestBySource = new Map();
  for (const review of reviews) {
    const { version, releaseSourceSha } = review;
    if (!/^\d+\.\d+\.\d+$/u.test(version) || !/^[0-9a-f]{40}$/u.test(releaseSourceSha)) continue;
    const key = `${version}/${releaseSourceSha}`;
    if (!newestBySource.has(key)) newestBySource.set(key, review);
  }
  for (const { version, releaseSourceSha, status, url } of newestBySource.values()) {
    if (status !== 'available' || url !== IOS_INVITATION) continue;
    const tag = `v${version}`;
    const release = await releaseByTag(api, tag);
    if (release?.tag_name !== tag || release.draft !== false || !release.published_at ||
        !Number.isSafeInteger(release.id) || typeof release.body !== 'string' || !release.body.includes(reviewCell)) continue;
    if ((await api('GET', `commits/${tag}`)).sha !== releaseSourceSha) continue;
    const current = await api('GET', `releases/${release.id}`);
    if (current.tag_name !== tag || current.draft !== false || current.body !== release.body) continue;
    const body = current.body.replace(table, block => updateTable(block, version));
    if (body !== current.body) await api('PATCH', `releases/${release.id}`, { body });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertQualityCommandAllowed('runner:testflight-release-status');
  if (process.env.GITHUB_REPOSITORY !== 'campfirium/foliole') {
    throw new Error('TestFlight release status sync requires the trusted hosted workflow');
  }
  const reviews = JSON.parse(await readFile('.tmp/testflight-review-status.json', 'utf8'));
  await syncTestflightReleaseStatus(createMobileGithubApi(process.env.GH_TOKEN), reviews);
}
