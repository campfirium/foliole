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

const T5_WORKFLOW = '.github/workflows/t5-baseline-admission.yml';
const T6_WORKFLOW = '.github/workflows/t6-hosted-quality.yml';
const T7_WORKFLOW = '.github/workflows/release-candidate-quality.yml';

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
    workflowName: overrides.workflowName ?? 'T6 Hosted Quality'
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
      workflows: [T6_WORKFLOW],
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
  it('baselines the first scan without emitting existing failures', () => {
    gh.runs = [run({ databaseId: 101 })];
    const state = { actions: {}, submitted: {}, issues: {}, prs: {} };

    const events = listGithubMonitorEvents(config(), state, false, [], renderTemplate);

    expect(events).toEqual([]);
    expect(state.actions[T6_WORKFLOW]).toMatchObject({
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
      controllerRole: 'hosted-quality-repair-controller',
      controllerRunId: '102',
      dedupeKey: 'foliole:github-actions:102',
      runTier: 'T6',
      title: 'Foliole T6 hosted quality repair: run 102',
      triggerEvent: 'schedule'
    });
  });

  it('skips non-dev branches and already submitted failures', () => {
    gh.runs = [
      run({ databaseId: 103, headBranch: 'release/0.6.5' }),
      run({ databaseId: 104, headBranch: 'dev' })
    ];
    const state = {
      actions: { [T6_WORKFLOW]: { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: { 'foliole:github-actions:104': { emittedAt: '2026-07-03T01:00:00Z' } }
    };

    const events = listGithubMonitorEvents(config(), state, false, [], renderTemplate);

    expect(events).toEqual([]);
    expect(state.actions[T6_WORKFLOW].runs['103']).toBeUndefined();
    expect(state.actions[T6_WORKFLOW].runs['104']).toBeDefined();
  });

  it('emits configured non-hosted action workflows without hosted repair metadata', () => {
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
      runTier: 'Actions',
      title: 'Foliole Actions failed: Other Workflow'
    });
    expect(state.actions['Other Workflow'].runs['105']).toBeDefined();
  });

  it.each([
    [T5_WORKFLOW, 'T5 Baseline Admission', 'T5'],
    [T6_WORKFLOW, 'T6 Hosted Quality', 'T6'],
    [T7_WORKFLOW, 'T7 Release Candidate Quality', 'T7']
  ])('emits %s failures through the hosted-quality controller', (workflowPath, workflowName, runTier) => {
    gh.runs = [run({ databaseId: 106, headSha: 'barrier-owned', workflowName })];
    const state = {
      actions: { [workflowPath]: { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: {}
    };

    const events = listGithubMonitorEvents(config({
      branches: [],
      workflows: [workflowPath]
    }), state, false, [], renderTemplate);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      prompt: `${runTier}:${workflowName}:dev:106`,
      runTier,
      title: `Foliole ${runTier} hosted quality repair: run 106`,
      workflowPath
    });
  });
  it('emits each recurring T6 failure once by run id', () => {
    const state = {
      actions: { [T6_WORKFLOW]: { initialized: true, runs: {} } },
      issues: {},
      prs: {},
      submitted: {}
    };
    const t6Config = config({ workflows: [T6_WORKFLOW] });

    gh.runs = [run({
      createdAt: '2026-07-05T07:29:18Z',
      databaseId: 201
    })];
    const firstEvents = listGithubMonitorEvents(t6Config, state, false, [], renderTemplate);
    expect(firstEvents).toHaveLength(1);
    state.submitted[firstEvents[0].dedupeKey] = { emittedAt: '2026-07-05T07:55:22Z' };

    gh.runs = [run({
      createdAt: '2026-07-05T17:20:05Z',
      databaseId: 202,
      headSha: 'def456'
    })];
    const secondEvents = listGithubMonitorEvents(t6Config, state, false, [], renderTemplate);
    expect(secondEvents).toHaveLength(1);
    expect(secondEvents[0]).toMatchObject({
      dedupeKey: 'foliole:github-actions:202',
      runTier: 'T6'
    });
    state.submitted[secondEvents[0].dedupeKey] = { emittedAt: '2026-07-05T17:45:22Z' };
    expect(listGithubMonitorEvents(t6Config, state, false, [], renderTemplate)).toEqual([]);
  });
});
