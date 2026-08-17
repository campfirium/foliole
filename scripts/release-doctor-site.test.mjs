// @vitest-environment node

import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import { checkSiteSync } from './release-doctor-site.mjs';
import {
  commandRunner, findCheck, githubResponses, onlineDownloads, siteHome
} from './release-doctor.test-support.mjs';

describe('post-public site download verification', () => {
  it('fails when the site has a missing, extra, or incorrect platform link', async () => {
    const version = '0.9.0';
    const expected = onlineDownloads(version);
    const responses = githubResponses(version);
    const key = 'gh api repos/campfirium/foliole-site/contents/content/downloads.json?ref=main --jq .content';
    responses[key] = {
      status: 0,
      stdout: Buffer.from(JSON.stringify({ ...expected, platforms: {} })).toString('base64'),
      stderr: ''
    };
    const checks = await checkSiteSync(
      version, '.', commandRunner(responses), async () => expected, async () => siteHome(expected)
    );
    expect(findCheck({ checks }, 'site download manifest')).toMatchObject({ status: 'FAIL' });
  });

  it('fails when a green sync run skipped production deployment', async () => {
    const version = '0.9.0';
    const expected = onlineDownloads(version);
    const responses = githubResponses(version);
    responses['gh run view 123 --repo campfirium/foliole-site --json jobs'] = {
      status: 0,
      stdout: JSON.stringify({ jobs: [
        { conclusion: 'success', name: 'build' },
        { conclusion: 'skipped', name: 'deploy' },
        { conclusion: 'skipped', name: 'deploy-origin' }
      ] }),
      stderr: ''
    };
    const checks = await checkSiteSync(
      version, '.', commandRunner(responses), async () => expected, async () => siteHome(expected)
    );
    expect(findCheck({ checks }, 'site production deployment')).toMatchObject({ status: 'FAIL' });
  });

  it('fails when foliole.app still exposes the previous downloads', async () => {
    const version = '0.9.0';
    const expected = onlineDownloads(version);
    const checks = await checkSiteSync(
      version, '.', commandRunner(githubResponses(version)), async () => expected,
      async () => siteHome(onlineDownloads('0.8.0'))
    );
    expect(findCheck({ checks }, 'site production downloads')).toMatchObject({ status: 'FAIL' });
  });
});
