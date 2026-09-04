import { describe, expect, it, vi } from 'vitest';

const github = vi.hoisted(() => ({
  checks: [{ bucket: 'fail', name: 'Windows checks' }],
  dependabotGate: { kind: 'electron-eligible' },
  issues: [{ author: { login: 'reporter' }, labels: [], number: 9, title: 'Existing issue', url: 'https://example.test/issues/9' }],
  prs: [{ author: { login: 'dependabot' }, baseRefName: 'dev', headRefName: 'deps', isDraft: false, number: 8, title: 'Existing PR', url: 'https://example.test/pull/8' }]
}));

vi.mock('./github-dependabot-pr-eligibility.mjs', () => ({
  dependabotPrCanEmit: vi.fn(({ errors, pr, recordError }) => {
    if (pr.author?.login !== 'app/dependabot') return true;
    if (['electron-eligible', 'other-dependency'].includes(github.dependabotGate.kind)) return true;
    if (github.dependabotGate.kind === 'source-error') {
      recordError(errors, 'github-pr-eligibility', `#${pr.number}`, new Error(github.dependabotGate.reason));
    }
    return false;
  }),
  resolveDependabotPrEligibility: vi.fn(() => github.dependabotGate)
}));

vi.mock('./github-monitor-gh.mjs', () => ({
  getPrCheckSignal: (_config, checks) => ({ eventSuffix: checks[0].name, label: checks[0].name }),
  listPrChecks: vi.fn(() => github.checks),
  recordMonitorError: vi.fn((errors, source, detail, error) => {
    errors.push({ detail, message: error.message, source });
  }),
  runGh: vi.fn((args) => args[0] === 'pr' ? github.prs : github.issues)
}));

const { listGithubMonitorEvents } = await import('./github-desktop-handoff-events.mjs');

function configs() {
  const common = { defaultTtlSeconds: 1800, enabled: true, repository: 'campfirium/foliole', workspace: '/repo' };
  return {
    actions: { enabled: false },
    issues: { ...common, dedupeKeyPattern: 'issue:{eventId}', limit: 50, template: 'issue.md' },
    prs: { ...common, autoImplementAuthors: ['app/dependabot'], dedupeKeyPattern: 'pr:{eventId}', failureBuckets: ['fail'], includeDrafts: false, template: 'pr.md' }
  };
}

describe('GitHub desktop handoff baselines', () => {
  it('emits existing actionable PRs while retaining the issue baseline', () => {
    const state = { actions: {}, issues: {}, prs: {}, submitted: {} };

    const events = listGithubMonitorEvents(configs(), state, false, [], () => 'prompt');

    expect(events).toEqual([expect.objectContaining({ dedupeKey: 'pr:8:Windows checks', reconcileOpen: true })]);
    expect(state).toMatchObject({ issues: { 9: '9' }, issuesInitialized: true, prsInitialized: true });
  });

  it('re-emits a stable reconciliation identity for an open Dependabot PR after a rebase', () => {
    github.prs = [{
      author: { login: 'app/dependabot' },
      baseRefName: 'dev',
      headRefName: 'dependabot/npm_and_yarn/electron-40.0.0',
      headRefOid: 'dependabot-head-sha',
      isDraft: false,
      number: 42,
      title: 'Bump electron',
      url: 'https://example.test/pull/42'
    }];
    github.checks = [];
    const state = { actions: {}, issues: {}, prs: {}, prsInitialized: true, submitted: {} };

    const first = listGithubMonitorEvents(configs(), state, false, [], () => 'authorized prompt');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      dedupeKey: 'pr:42:local',
      handlingMode: 'automatic-local-implementation',
      title: 'PR #42 local Dependabot implementation'
    });
    state.submitted[first[0].dedupeKey] = { emittedAt: '2026-07-20T04:00:00Z' };
    state.prs['42'] = first[0].eventId;
    github.prs[0].headRefOid = 'rebased-dependabot-head-sha';
    expect(listGithubMonitorEvents(configs(), state, false, [], () => 'authorized prompt')).toEqual([
      expect.objectContaining({ dedupeKey: 'pr:42:local', reconcileOpen: true })
    ]);
  });

  it('reconciles a recorded head-scoped Dependabot event through its stable PR identity', () => {
    github.prs = [{
      author: { login: 'app/dependabot' },
      baseRefName: 'dev',
      headRefName: 'dependabot/npm_and_yarn/electron-44.0.0',
      headRefOid: 'new-head',
      isDraft: false,
      number: 46,
      title: 'Bump electron'
    }];
    github.checks = [];
    github.dependabotGate = { kind: 'electron-eligible' };
    const state = {
      actions: {},
      issues: {},
      prs: { 46: '46:local:old-head' },
      prsInitialized: true,
      submitted: {}
    };

    expect(listGithubMonitorEvents(configs(), state, false, [], () => 'prompt')).toEqual([
      expect.objectContaining({ dedupeKey: 'pr:46:local', reconcileOpen: true })
    ]);
  });

  it('does not checkpoint an immature Electron head and emits it after eligibility changes', () => {
    github.prs = [{
      author: { login: 'app/dependabot' },
      baseRefName: 'dev',
      headRefName: 'dependabot/npm_and_yarn/electron-44.1.0',
      headRefOid: 'same-head',
      isDraft: false,
      number: 43,
      title: 'Bump electron',
      url: 'https://example.test/pull/43'
    }];
    github.checks = [];
    github.dependabotGate = { kind: 'electron-deferred' };
    const state = { actions: {}, issues: {}, prs: {}, prsInitialized: true, submitted: {} };

    expect(listGithubMonitorEvents(configs(), state, false, [], () => 'prompt')).toEqual([]);
    expect(listGithubMonitorEvents(configs(), state, false, [], () => 'prompt')).toEqual([]);
    expect(state.prs).toEqual({});
    expect(state.submitted).toEqual({});

    github.dependabotGate = { kind: 'electron-eligible' };
    const events = listGithubMonitorEvents(configs(), state, false, [], () => 'prompt');
    expect(events).toHaveLength(1);
    expect(events[0].dedupeKey).toBe('pr:43:local');
    expect(state.prs).toEqual({});
  });

  it('records one recoverable eligibility error without checkpointing the PR', () => {
    github.prs = [{
      author: { login: 'app/dependabot' },
      baseRefName: 'dev',
      headRefOid: 'source-error-head',
      isDraft: false,
      number: 44
    }];
    github.dependabotGate = { kind: 'source-error', reason: 'version-mismatch' };
    const state = { actions: {}, issues: {}, prs: {}, prsInitialized: true, submitted: {} };
    const errors = [];

    expect(listGithubMonitorEvents(configs(), state, false, errors, () => 'prompt')).toEqual([]);
    expect(errors).toEqual([{
      detail: '#44',
      message: 'version-mismatch',
      source: 'github-pr-eligibility'
    }]);
    expect(state.prs).toEqual({});
  });

  it('keeps a verified non-Electron dependency on the existing route', () => {
    github.prs = [{
      author: { login: 'app/dependabot' },
      baseRefName: 'dev',
      headRefOid: 'other-head',
      isDraft: false,
      number: 45,
      title: 'Dependency update'
    }];
    github.checks = [];
    github.dependabotGate = { kind: 'other-dependency' };
    const state = { actions: {}, issues: {}, prs: {}, prsInitialized: true, submitted: {} };

    expect(listGithubMonitorEvents(configs(), state, false, [], () => 'prompt')).toHaveLength(1);
  });
});
