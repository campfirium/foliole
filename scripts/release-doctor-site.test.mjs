// @vitest-environment node

import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import { checkSiteSync } from './release-doctor-site.mjs';
import { commandRunner, findCheck, githubResponses, onlineDownloads } from './release-doctor.test-support.mjs';

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
    const checks = await checkSiteSync(version, '.', commandRunner(responses), async () => expected);
    expect(findCheck({ checks }, 'site download manifest')).toMatchObject({ status: 'FAIL' });
  });
});
