// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { IOS_INVITATION } from '../ios/testflight-candidate.mjs';
import { syncPlayReleaseStatus, syncTestflightReleaseStatus } from './sync-testflight-release-status.mjs';

const version = '0.8.1';
const sha = 'a'.repeat(40);
const link = `[TestFlight](${IOS_INVITATION})`;
const body = [
  `### Fixed\r\n\r\nKeep ${link} (In Review) in the notes.\r\n\r\n`,
  '| iPhone | Android |\r\n',
  '| :---: | :---: |\r\n',
  '| TestFlight | Open Testing |\r\n',
  '| 0.8.1 | 0.8.1 |\r\n',
  `| ${link} (In Review) | Play (In Review) |\r\n`
].join('');
const available = { version, releaseSourceSha: sha, status: 'available', url: IOS_INVITATION };

function fakeGitHub({ tagSha = sha, draft = false, editBeforeWrite = false, initialBody = body } = {}) {
  let current = { id: 42, tag_name: 'v0.8.1', draft, published_at: '2026-11-07', body: initialBody };
  const writes = [];
  const api = vi.fn(async (method, route, payload) => {
    if (method === 'PATCH' && route === 'releases/42') {
      writes.push(payload);
      current = { ...current, ...payload };
      return current;
    }
    if (route === 'releases/tags/v0.8.1') return current;
    if (route === 'commits/v0.8.1') return { sha: tagSha };
    if (route === 'releases/42') return editBeforeWrite ? { ...current, body: body + 'Manual edit' } : current;
    throw new Error(`Unexpected request: ${method} ${route}`);
  });
  return { api, writes };
}

it('updates only the matching TestFlight download cell after a fresh availability check', async () => {
  const { api, writes } = fakeGitHub();
  await syncTestflightReleaseStatus(api, [{ ...available, status: 'in-review' }]);
  expect(writes).toEqual([]);
  await syncTestflightReleaseStatus(api, [available]);
  await syncTestflightReleaseStatus(api, [available]);
  expect(writes).toEqual([{ body: body.replace(`| ${link} (In Review) |`, `| ${link} |`) }]);
});

it('links the matching Play build once while retaining the APK and other release notes', async () => {
  const apk = '[APK](https://github.com/campfirium/foliole/releases/download/v0.8.1/Foliole-Android-0.8.1.apk)';
  const initialBody = body.replace('| Play (In Review) |', `| ${apk} · Play (In Review) |`) + '\r\nPlay (In Review)\r\n';
  const url = 'https://play.google.com/apps/testing/com.campfirium.foliole.android';
  const android = { ...available, build: '5', url };
  const { api, writes } = fakeGitHub({ initialBody });
  await syncPlayReleaseStatus(api, [
    { ...android, version: '0.8.0', status: 'verifying' },
    { ...android, url: 'https://example.com/' }
  ]);
  expect(writes).toEqual([]);
  await syncPlayReleaseStatus(api, [android]);
  await syncPlayReleaseStatus(api, [android]);
  expect(writes).toEqual([{ body: initialBody.replace(`${apk} · Play (In Review)`, `${apk} · [Play](${url})`) }]);

  for (const options of [{ tagSha: 'b'.repeat(40) }, { draft: true }, { editBeforeWrite: true }]) {
    const mismatched = fakeGitHub({ initialBody, ...options });
    await syncPlayReleaseStatus(mismatched.api, [android]);
    expect(mismatched.writes).toEqual([]);
  }
});

it('preserves drafts, unrelated builds, superseded approvals, and concurrent manual edits', async () => {
  for (const options of [{ tagSha: 'b'.repeat(40) }, { draft: true }, { editBeforeWrite: true }]) {
    const { api, writes } = fakeGitHub(options);
    await syncTestflightReleaseStatus(api, [available]);
    expect(writes).toEqual([]);
  }
  const { api } = fakeGitHub();
  await syncTestflightReleaseStatus(api, [
    { ...available, releaseSourceSha: undefined },
    { ...available, status: 'in-review' },
    available
  ]);
  expect(api).not.toHaveBeenCalled();
});
