/* global console */
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

function updatePlayTable(body, version, release) {
  const asset = `Foliole-Android-${version}.apk`;
  const url = `https://github.com/campfirium/foliole/releases/download/v${version}/${asset}`;
  const pending = `[APK](${url}) · Play (In Review)`;
  const linked = `[APK](${url}) · [Play](${playInvitation})`;
  const matches = [];
  for (const block of body.matchAll(table)) {
    const lines = block[0].split(/(?<=\n)/u);
    const headers = lines[0].split('|').map(cell => cell.trim());
    for (const [column, header] of headers.entries()) {
      if (!['Android', '**Android**'].includes(header)) continue;
      for (const [row, line] of lines.entries()) {
        const cell = line.split('|')[column]?.trim();
        if (cell === pending || cell === linked) matches.push({ block, lines, row, column, cell });
      }
    }
  }
  const match = matches[0];
  if (matches.length === 1 && match.cell === linked) return body;
  if (matches.length !== 1 || !release.assets?.some(item => item.name === asset && item.state === 'uploaded' &&
    /^sha256:[0-9a-f]{64}$/u.test(item.digest ?? ''))) {
    console.warn(`Play link v${version}: expected one matching Android download cell and its uploaded APK`);
    return body;
  }
  const cells = match.lines[match.row].split('|');
  cells[match.column] = cells[match.column].replace(pending, linked);
  match.lines[match.row] = cells.join('|');
  const end = match.block.index + match.block[0].length;
  return body.slice(0, match.block.index) + match.lines.join('') + body.slice(end);
}

const play = { url: playInvitation, review: 'Play (In Review)', update: updatePlayTable };

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
    const body = channel.update ? channel.update(current.body, version, current) :
      current.body.replace(table, block => updateTable(block, version, channel));
    if (body !== current.body) await api('PATCH', `releases/${release.id}`, { body });
  }
}

export async function syncTestflightReleaseStatus(api, reviews) {
  await syncReleaseStatus(api, reviews, testflight);
}

export async function syncPlayReleaseStatus(api, reviews) {
  await syncReleaseStatus(api, reviews.filter(review => review.releaseLane === 'release-t7'), play);
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
