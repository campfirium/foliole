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
    workflowName: overrides.workflowName ?? 'T5 Nightly Remote Quality'
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
      workflows: ['T5 Nightly Remote Quality'],
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
    expect(state.actions['T5 Nightly Remote Quality']).toMatchObject({
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
      title: 'Foliole T5 failed: T5 Nightly Remote Quality'
    });
  });

  it('skips non-dev branches and already submitted failures', () => {
    gh.runs = [
      run({ databaseId: 103, headBranch: 'release/0.6.5' }),
      run({ databaseId: 104, headBranch: 'dev' })
    ];
    const state = {
      actions: { 'T5 Nightly Remote Quality': { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: { 'foliole:github-actions:104': { emittedAt: '2026-07-03T01:00:00Z' } }
    };

    const events = listGithubMonitorEvents(config(), state, false, [], renderTemplate);

    expect(events).toEqual([]);
    expect(state.actions['T5 Nightly Remote Quality'].runs['103']).toBeUndefined();
    expect(state.actions['T5 Nightly Remote Quality'].runs['104']).toBeDefined();
  });

  it('emits configured non-T5 action workflows without T4 barrier suppression', () => {
    gh.runs = [run({
      databaseId: 105,
      headSha: 'barrier-owned',
      workflowName: 'Other Workflow'
    })];
    const state = {
      actions: { 'Other Workflow': { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: {}
    };

    const events = listGithubMonitorEvents(config({ workflows: ['Other Workflow'] }), state, false, [], renderTemplate);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      prompt: 'Actions:Other Workflow:dev:105',
      tier: 'Actions',
      title: 'Foliole Actions failed: Other Workflow'
    });
    expect(state.actions['Other Workflow'].runs['105']).toBeDefined();
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
  it('coalesces recurring T5 failures until the workflow recovers', () => {
    const state = {
      actions: { 'T5 Nightly Remote Quality': { initialized: true, runs: {}, incidents: {} } },
      issues: {},
      prs: {},
      submitted: {}
    };
    const t5Config = config({ workflows: ['T5 Nightly Remote Quality'] });

    gh.runs = [run({
      createdAt: '2026-07-05T07:29:18Z',
      databaseId: 201,
      workflowName: 'T5 Nightly Remote Quality'
    })];
    expect(listGithubMonitorEvents(t5Config, state, false, [], renderTemplate)).toHaveLength(1);

    gh.runs = [run({
      createdAt: '2026-07-05T17:20:05Z',
      databaseId: 202,
      headSha: 'def456',
      workflowName: 'T5 Nightly Remote Quality'
    })];
    expect(listGithubMonitorEvents(t5Config, state, false, [], renderTemplate)).toEqual([]);
    expect(state.actions['T5 Nightly Remote Quality'].incidents.dev).toMatchObject({
      active: true,
      firstFailureRunId: '201',
      lastFailureRunId: '202'
    });
  });

  it('emits a recurring T5 failure again after a completed non-failure recovery', () => {
    const state = {
      actions: {
        'T5 Nightly Remote Quality': {
          initialized: true,
          runs: {},
          incidents: {
            dev: {
              active: true,
              firstFailureRunId: '201',
              notifiedDedupeKey: 'foliole:github-actions:201',
              notifiedRunId: '201'
            }
          }
        }
      },
      issues: {},
      prs: {},
      submitted: { 'foliole:github-actions:201': { emittedAt: '2026-07-05T07:55:22Z' } }
    };
    const t5Config = config({ workflows: ['T5 Nightly Remote Quality'] });

    gh.runs = [
      run({
        conclusion: 'success',
        createdAt: '2026-07-05T18:00:00Z',
        databaseId: 203,
        workflowName: 'T5 Nightly Remote Quality'
      }),
      run({
        createdAt: '2026-07-05T17:20:05Z',
        databaseId: 202,
        workflowName: 'T5 Nightly Remote Quality'
      })
    ];
    expect(listGithubMonitorEvents(t5Config, state, false, [], renderTemplate)).toEqual([]);
    expect(state.actions['T5 Nightly Remote Quality'].incidents.dev).toMatchObject({
      active: false,
      recoveredRunId: '203'
    });

    gh.runs = [run({
      createdAt: '2026-07-05T19:00:00Z',
      databaseId: 204,
      headSha: 'ghi789',
      workflowName: 'T5 Nightly Remote Quality'
    })];
    const events = listGithubMonitorEvents(t5Config, state, false, [], renderTemplate);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      dedupeKey: 'foliole:github-actions:204',
      tier: 'T5'
    });
  });
});
