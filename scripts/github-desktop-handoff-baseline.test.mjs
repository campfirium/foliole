import { describe, expect, it, vi } from 'vitest';

const github = vi.hoisted(() => ({
  checks: [{ bucket: 'fail', name: 'Windows checks' }],
  issues: [{ author: { login: 'reporter' }, labels: [], number: 9, title: 'Existing issue', url: 'https://example.test/issues/9' }],
  prs: [{ author: { login: 'dependabot' }, baseRefName: 'dev', headRefName: 'deps', isDraft: false, number: 8, title: 'Existing PR', url: 'https://example.test/pull/8' }]
}));

vi.mock('./github-monitor-gh.mjs', () => ({
  getPrCheckSignal: (_config, checks) => ({ eventSuffix: checks[0].name, label: checks[0].name }),
  listPrChecks: vi.fn(() => github.checks),
  recordMonitorError: vi.fn(),
  runGh: vi.fn((args) => args[0] === 'pr' ? github.prs : github.issues)
}));

const { listGithubMonitorEvents } = await import('./github-desktop-handoff-events.mjs');

function configs() {
  const common = { defaultTtlSeconds: 1800, enabled: true, repository: 'campfirium/foliole', workspace: '/repo' };
  return {
    actions: { enabled: false },
    issues: { ...common, dedupeKeyPattern: 'issue:{eventId}', limit: 50, template: 'issue.md' },
    prs: { ...common, dedupeKeyPattern: 'pr:{eventId}', failureBuckets: ['fail'], includeDrafts: false, template: 'pr.md' }
  };
}

describe('GitHub desktop handoff baselines', () => {
  it('records existing PRs and issues without emitting them on the first successful scan', () => {
    const state = { actions: {}, issues: {}, prs: {}, submitted: {} };

    const events = listGithubMonitorEvents(configs(), state, false, [], () => 'prompt');

    expect(events).toEqual([]);
    expect(state).toMatchObject({ issues: { 9: '9' }, issuesInitialized: true, prsInitialized: true });
    expect(state.prs[8]).toContain('8:Windows checks');
  });
});
