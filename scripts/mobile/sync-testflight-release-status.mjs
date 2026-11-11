import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { IOS_INVITATION } from '../ios/testflight-candidate.mjs';
import { PLAY_PACKAGE } from '../android/play-api.mjs';
import { createMobileGithubApi } from './mobile-candidate-store.mjs';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';

const testflightLink = `[TestFlight](${IOS_INVITATION})`;
const playInvitation = `https://play.google.com/apps/testing/${PLAY_PACKAGE}`;
const testflight = {
  columns: ['iPhone', 'iPhone (TestFlight)'],
  url: IOS_INVITATION,
  review: `${testflightLink} (In Review)`,
  link: testflightLink,
  matches: cell => cell === `${testflightLink} (In Review)`
};
const play = {
  columns: ['Android'],
  url: playInvitation,
  review: 'Play (In Review)',
  link: `[Play](${playInvitation})`,
  matches: cell => /^(?:\[APK\]\(https:\/\/github\.com\/campfirium\/foliole\/releases\/download\/[^)]+\) · )?Play \(In Review\)$/u.test(cell)
};
const table = /(?:^\|[^\r\n]*\|[ \t]*(?:\r?\n|$))+/gmu;

function updateTable(block, version, channel) {
  const lines = block.split(/(?<=\n)/u);
  const column = lines[0].split('|').findIndex(cell => channel.columns.includes(cell.trim()));
  if (column < 1) return block;
  const row = lines.findIndex((line, index) => index > 0 &&
    channel.matches(line.split('|')[column]?.trim() ?? '') &&
    lines[index - 1].split('|')[column]?.trim() === version);
  if (row < 0) return block;
  const cells = lines[row].split('|');
  cells[column] = cells[column].replace(channel.review, channel.link);
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

async function syncReleaseStatus(api, reviews, channel) {
  const newestBySource = new Map();
  for (const review of reviews) {
    const { version, releaseSourceSha } = review;
    if (!/^\d+\.\d+\.\d+$/u.test(version) || !/^[0-9a-f]{40}$/u.test(releaseSourceSha)) continue;
    const key = `${version}/${releaseSourceSha}`;
    if (!newestBySource.has(key)) newestBySource.set(key, review);
  }
  for (const { version, releaseSourceSha, status, url } of newestBySource.values()) {
    if (status !== 'available' || url !== channel.url) continue;
    const tag = `v${version}`;
    const release = await releaseByTag(api, tag);
    if (release?.tag_name !== tag || release.draft !== false || !release.published_at ||
        !Number.isSafeInteger(release.id) || typeof release.body !== 'string' || !release.body.includes(channel.review)) continue;
    if ((await api('GET', `commits/${tag}`)).sha !== releaseSourceSha) continue;
    const current = await api('GET', `releases/${release.id}`);
    if (current.tag_name !== tag || current.draft !== false || current.body !== release.body) continue;
    const body = current.body.replace(table, block => updateTable(block, version, channel));
    if (body !== current.body) await api('PATCH', `releases/${release.id}`, { body });
  }
}

export async function syncTestflightReleaseStatus(api, reviews) {
  await syncReleaseStatus(api, reviews, testflight);
}

export async function syncPlayReleaseStatus(api, reviews) {
  await syncReleaseStatus(api, reviews, play);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertQualityCommandAllowed('runner:testflight-release-status');
  if (process.env.GITHUB_REPOSITORY !== 'campfirium/foliole') {
    throw new Error('TestFlight release status sync requires the trusted hosted workflow');
  }
  const api = createMobileGithubApi(process.env.GH_TOKEN);
  const ios = JSON.parse(await readFile('.tmp/testflight-review-status.json', 'utf8'));
  const android = JSON.parse(await readFile('.tmp/play-release-status.json', 'utf8'));
  await syncTestflightReleaseStatus(api, ios);
  await syncPlayReleaseStatus(api, android);
}
