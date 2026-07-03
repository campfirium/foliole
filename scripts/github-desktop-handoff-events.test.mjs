import { describe, expect, it, vi } from 'vitest';

const gh = vi.hoisted(() => ({
  runs: [],
  runGh: vi.fn((args) => {
    if (args[0] !== 'run' || args[1] !== 'list') {
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    }
    return gh.runs;
  })
}));

vi.mock('./github-monitor-gh.mjs', () => ({
  listPrChecks: vi.fn(),
  recordMonitorError: vi.fn((errors, kind, subject, error) => {
    errors.push({ kind, subject, message: error.message });
  }),
  runGh: gh.runGh
}));

vi.mock('./t4-archive-barrier-state.mjs', () => ({
  hasPendingBarrierForRun: vi.fn((run) => run.headSha === 'barrier-owned')
}));

const { listGithubMonitorEvents } = await import('./github-desktop-handoff-events.mjs');

function run(overrides = {}) {
  return {
    conclusion: overrides.conclusion ?? 'failure',
    createdAt: overrides.createdAt ?? '2026-07-03T01:00:00Z',
    databaseId: overrides.databaseId ?? 100,
    displayTitle: overrides.displayTitle ?? 'Push dev',
    headBranch: overrides.headBranch ?? 'dev',
    headSha: overrides.headSha ?? 'abc123',
    status: overrides.status ?? 'completed',
    url: overrides.url ?? 'https://github.com/campfirium/foliole/actions/runs/100',
    workflowName: overrides.workflowName ?? 'Branch Push Health'
  };
}

function config(overrides = {}) {
  return {
    actions: {
      branches: ['dev'],
      dedupeKeyPattern: 'foliole:github-actions:{eventId}',
      defaultTtlSeconds: 1800,
      enabled: true,
      failureConclusions: ['failure', 'timed_out', 'action_required'],
      repository: 'campfirium/foliole',
      template: '.codex/monitors/templates/github-actions.md',
      workflows: ['Branch Push Health'],
      workspace: 'D:\\C\\foliole',
      ...overrides
    },
    issues: { enabled: false },
    prs: { enabled: false }
  };
}

function renderTemplate(_template, data) {
  return `${data.tier}:${data.workflow}:${data.branch}:${data.runId}`;
}

describe('GitHub desktop handoff action events', () => {
  it('baselines the first scan without emitting existing failures', () => {
    gh.runs = [run({ databaseId: 101 })];
    const state = { actions: {}, submitted: {}, issues: {}, prs: {} };

    const events = listGithubMonitorEvents(config(), state, false, [], renderTemplate);

    expect(events).toEqual([]);
    expect(state.actions['Branch Push Health']).toMatchObject({
      initialized: true,
      latestObservedRunId: '101'
    });
  });

  it('emits a running run after it completes as a failure', () => {
    const state = { actions: {}, submitted: {}, issues: {}, prs: {} };
    gh.runs = [run({ databaseId: 102, conclusion: '', status: 'in_progress' })];
    expect(listGithubMonitorEvents(config(), state, false, [], renderTemplate)).toEqual([]);

    gh.runs = [run({ databaseId: 102, conclusion: 'failure', status: 'completed' })];
    const events = listGithubMonitorEvents(config(), state, false, [], renderTemplate);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      branch: 'dev',
      dedupeKey: 'foliole:github-actions:102',
      title: 'Foliole T4 failed: Branch Push Health'
    });
  });

  it('skips non-dev branches and already submitted failures', () => {
    gh.runs = [
      run({ databaseId: 103, headBranch: 'release/0.6.5' }),
      run({ databaseId: 104, headBranch: 'dev' })
    ];
    const state = {
      actions: { 'Branch Push Health': { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: { 'foliole:github-actions:104': { emittedAt: '2026-07-03T01:00:00Z' } }
    };

    const events = listGithubMonitorEvents(config(), state, false, [], renderTemplate);

    expect(events).toEqual([]);
    expect(state.actions['Branch Push Health'].runs['103']).toBeUndefined();
    expect(state.actions['Branch Push Health'].runs['104']).toBeDefined();
  });

  it('suppresses standalone action events for barrier-owned failures', () => {
    gh.runs = [run({ databaseId: 105, headSha: 'barrier-owned' })];
    const state = {
      actions: { 'Branch Push Health': { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: {}
    };

    const events = listGithubMonitorEvents(config(), state, false, [], renderTemplate);

    expect(events).toEqual([]);
    expect(state.actions['Branch Push Health'].runs['105']).toBeDefined();
  });

  it('emits T5 nightly remote quality failures as independent handoffs', () => {
    gh.runs = [run({
      databaseId: 106,
      headSha: 'barrier-owned',
      workflowName: 'T5 Nightly Remote Quality'
    })];
    const state = {
      actions: { 'T5 Nightly Remote Quality': { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: {}
    };

    const events = listGithubMonitorEvents(config({
      workflows: ['T5 Nightly Remote Quality']
    }), state, false, [], renderTemplate);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      prompt: 'T5:T5 Nightly Remote Quality:dev:106',
      tier: 'T5',
      title: 'Foliole T5 failed: T5 Nightly Remote Quality'
    });
  });
});
