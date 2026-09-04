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

const T7_WORKFLOW = '.github/workflows/t7-hosted-quality.yml';

function run(overrides = {}) {
  return {
    conclusion: overrides.conclusion ?? 'failure',
    createdAt: overrides.createdAt ?? '2026-07-03T01:00:00Z',
    databaseId: overrides.databaseId ?? 100,
    displayTitle: overrides.displayTitle ?? 'Push dev',
    event: overrides.event ?? 'schedule',
    headBranch: overrides.headBranch ?? 'dev',
    headSha: overrides.headSha ?? 'abc123',
    status: overrides.status ?? 'completed',
    url: overrides.url ?? 'https://github.com/campfirium/foliole/actions/runs/100',
    workflowName: overrides.workflowName ?? 'T7 Hosted Quality'
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
      workflows: [T7_WORKFLOW],
      workspace: 'D:\\C\\foliole',
      ...overrides
    },
    issues: { enabled: false },
    prs: { enabled: false }
  };
}

function renderTemplate(_template, data) {
  return `${data.runTier}:${data.workflow}:${data.branch}:${data.runId}`;
}

describe('GitHub desktop handoff action events', () => {
  it('emits the latest existing failure for visibility reconciliation on the first scan', () => {
    gh.runs = [run({ databaseId: 101 })];
    const state = { actions: {}, submitted: {}, issues: {}, prs: {} };

    const events = listGithubMonitorEvents(config(), state, false, [], renderTemplate);

    expect(events).toEqual([expect.objectContaining({
      dedupeKey: 'foliole:github-actions:101',
      reconcileOpen: true
    })]);
    expect(state.actions[T7_WORKFLOW]).toMatchObject({
      initialized: true,
      latestObservedRunId: '101'
    });
    expect(listGithubMonitorEvents(config(), state, false, [], renderTemplate)).toEqual([
      expect.objectContaining({ dedupeKey: 'foliole:github-actions:101', reconcileOpen: true })
    ]);
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
      controllerRole: 'hosted-quality-repair-controller',
      controllerRunId: '102',
      dedupeKey: 'foliole:github-actions:102',
      runTier: 'T7',
      title: 'Foliole T7 hosted quality repair: run 102',
      triggerEvent: 'schedule'
    });
  });

  it('skips release branches and already submitted dev failures', () => {
    gh.runs = [
      run({ databaseId: 103, headBranch: 'release' }),
      run({ databaseId: 104, headBranch: 'dev' })
    ];
    const state = {
      actions: { [T7_WORKFLOW]: { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: { 'foliole:github-actions:104': { emittedAt: '2026-07-03T01:00:00Z' } }
    };

    const events = listGithubMonitorEvents(config({ branches: [] }), state, false, [], renderTemplate);

    expect(events).toEqual([]);
    expect(state.actions[T7_WORKFLOW].runs['103']).toBeUndefined();
    expect(state.actions[T7_WORKFLOW].runs['104']).toBeDefined();
  });

  it('does not emit a configured workflow outside the independent dev T7 stream', () => {
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

    expect(events).toEqual([]);
    expect(state.actions['Other Workflow'].runs['105']).toBeUndefined();
  });

  it('emits only the stable T7 Hosted Quality path through the controller', () => {
    gh.runs = [run({ databaseId: 106, headSha: 'barrier-owned' })];
    const state = {
      actions: { [T7_WORKFLOW]: { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: {}
    };

    const events = listGithubMonitorEvents(config({
      branches: [],
      workflows: [T7_WORKFLOW]
    }), state, false, [], renderTemplate);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      prompt: 'T7:T7 Hosted Quality:dev:106',
      runTier: 'T7',
      title: 'Foliole T7 hosted quality repair: run 106',
      workflowPath: T7_WORKFLOW
    });
  });
  it('re-emits the latest failing T7 run with a stable reconciliation identity', () => {
    const state = {
      actions: { [T7_WORKFLOW]: { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: {}
    };
    const t7Config = config({ workflows: [T7_WORKFLOW] });

    gh.runs = [run({
      createdAt: '2026-07-05T07:29:18Z',
      databaseId: 201
    })];
    const firstEvents = listGithubMonitorEvents(t7Config, state, false, [], renderTemplate);
    expect(firstEvents).toHaveLength(1);
    state.submitted[firstEvents[0].dedupeKey] = { emittedAt: '2026-07-05T07:55:22Z' };

    gh.runs = [run({
      createdAt: '2026-07-05T17:20:05Z',
      databaseId: 202,
      headSha: 'def456'
    })];
    const secondEvents = listGithubMonitorEvents(t7Config, state, false, [], renderTemplate);
    expect(secondEvents).toHaveLength(1);
    expect(secondEvents[0]).toMatchObject({
      dedupeKey: 'foliole:github-actions:202',
      runTier: 'T7'
    });
    state.submitted[secondEvents[0].dedupeKey] = { emittedAt: '2026-07-05T17:45:22Z' };
    expect(listGithubMonitorEvents(t7Config, state, false, [], renderTemplate)).toEqual([
      expect.objectContaining({ dedupeKey: 'foliole:github-actions:202', reconcileOpen: true })
    ]);
  });

  it('retries a newly observed failure until event submission is acknowledged', () => {
    const state = {
      actions: { [T7_WORKFLOW]: { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: {}
    };
    gh.runs = [run({ databaseId: 203 })];

    const firstEvents = listGithubMonitorEvents(config(), state, false, [], renderTemplate);
    const retryEvents = listGithubMonitorEvents(config(), state, false, [], renderTemplate);

    expect(firstEvents).toHaveLength(1);
    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0].dedupeKey).toBe('foliole:github-actions:203');
  });
});
