import { describe, expect, it } from 'vitest';

import { buildPrHandoffData } from './github-desktop-handoff-title.mjs';

const config = {
  autoImplementAuthors: ['app/dependabot'],
  failureBuckets: ['fail'],
  includeNoChecks: true,
  repository: 'campfirium/foliole',
  workspace: 'D:\\C\\foliole'
};

const pr = {
  author: { login: 'octocat' },
  baseRefName: 'dev',
  headRefName: 'fix/handoff',
  number: 42,
  title: 'Repair desktop handoff labels',
  url: 'https://github.com/campfirium/foliole/pull/42'
};

describe('GitHub desktop handoff title data', () => {
  it('front-loads the PR number and failing check in the handoff title', () => {
    const data = buildPrHandoffData(config, pr, [
      { bucket: 'pass', name: 'lint' },
      { bucket: 'fail', name: 'test:desktop' }
    ]);

    expect(data.handoffTitle).toBe('PR #42 failed: test:desktop');
    expect(data.prTitle).toBe('Repair desktop handoff labels');
    expect(data.eventId).toBe('42:test:desktop');
  });

  it('uses a dedicated PR handling title for PRs that have no reported checks', () => {
    const data = buildPrHandoffData(config, pr, []);

    expect(data.handoffTitle).toBe('PR #42 needs PR handling');
    expect(data.failingChecks).toBe('No checks reported');
    expect(data.checkSignalSuffix).toBe('no-checks');
    expect(data.eventId).toBe('42:no-checks');
  });

  it('creates one stable local implementation event per verified Dependabot PR', () => {
    const data = buildPrHandoffData(config, {
      ...pr,
      author: { login: 'app/dependabot' },
      headRefOid: 'dependabot-head-sha'
    }, []);

    expect(data.handoffTitle).toBe('PR #42 Dependabot update');
    expect(data.failingChecks).toBe('Dependabot update proposal');
    expect(data.handlingMode).toBe('classify-then-handle');
    expect(data.eventId).toBe('42:local');

    const rebased = buildPrHandoffData(config, {
      ...pr,
      author: { login: 'app/dependabot' },
      headRefOid: 'rebased-dependabot-head-sha'
    }, []);
    expect(rebased.eventId).toBe(data.eventId);
  });

});
