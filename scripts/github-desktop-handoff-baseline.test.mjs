import { describe, expect, it, vi } from 'vitest';

vi.mock('./github-monitor-gh.mjs', () => ({
  getPrCheckSignal: () => ({ eventSuffix: 'Windows checks', label: 'Windows checks' }),
  listPrChecks: () => [{ bucket: 'fail', name: 'Windows checks' }],
  recordMonitorError: vi.fn(),
  runGh: (args) => args[0] === 'pr' ? [{
    author: { login: 'dependabot' }, baseRefName: 'dev', headRefName: 'deps',
    isDraft: false, number: 8, title: 'Existing PR', url: 'https://example.test/pull/8'
  }] : [{
    author: { login: 'reporter' }, labels: [], number: 9,
    title: 'Existing issue', url: 'https://example.test/issues/9'
  }]
}));

import { listGithubMonitorEvents } from './github-desktop-handoff-events.mjs';

describe('GitHub desktop handoff baselines', () => {
  it('emits existing actionable non-Dependabot PRs while retaining the issue baseline', () => {
    const common = { enabled: true, repository: 'campfirium/foliole', workspace: '/repo' };
    const configs = {
      actions: { enabled: false },
      issues: { ...common, dedupeKeyPattern: 'issue:{eventId}', template: 'issue.md' },
      prs: { ...common, dedupeKeyPattern: 'pr:{eventId}', template: 'pr.md' }
    };
    const state = { actions: {}, issues: {}, prs: {}, submitted: {} };
    expect(listGithubMonitorEvents(configs, state, false, [], () => 'prompt')).toEqual([
      expect.objectContaining({ dedupeKey: 'pr:8:Windows checks', reconcileOpen: true })
    ]);
    expect(state).toMatchObject({ issues: { 9: '9' }, issuesInitialized: true, prsInitialized: true });
  });
});
