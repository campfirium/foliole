import { buildIssueHandoffData, buildPrHandoffData } from './github-desktop-handoff-title.mjs';
import { listPrChecks, recordMonitorError, runGh } from './github-monitor-gh.mjs';
import { hasPendingBarrierForRun } from './t4-archive-barrier-state.mjs';

const ACTION_WORKFLOW_TIERS = new Map([
  ['Branch Push Health', 'T4'],
  ['T5 Nightly Remote Quality', 'T5']
]);

function actionWorkflowTier(workflowName) {
  return ACTION_WORKFLOW_TIERS.get(workflowName) ?? 'Actions';
}

function actionRunEvent(config, run, renderTemplate) {
  const tier = actionWorkflowTier(run.workflowName);
  const data = {
    branch: run.headBranch,
    eventId: String(run.databaseId),
    headSha: run.headSha,
    repository: config.repository,
    runId: String(run.databaseId),
    runTitle: run.displayTitle,
    source: 'foliole/github-actions',
    tier,
    url: run.url,
    workflow: run.workflowName,
    workspace: config.workspace
  };
  return {
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', data.eventId),
    prompt: renderTemplate(config.template, data),
    title: `Foliole ${tier} failed: ${run.workflowName}`,
    ...data,
    ttlSeconds: config.defaultTtlSeconds
  };
}

function normalizeWorkflowState(state, workflow) {
  const existing = state.actions[workflow];
  if (existing && typeof existing === 'object') {
    existing.runs ??= {};
    existing.initialized ??= true;
    return existing;
  }
  const normalized = {
    baselineRunId: existing ? String(existing) : '',
    initialized: Boolean(existing),
    runs: existing ? { [String(existing)]: { status: 'unknown' } } : {}
  };
  state.actions[workflow] = normalized;
  return normalized;
}

function allowedBranch(config, run) {
  const branches = config.branches ?? [];
  return branches.length === 0 || branches.includes(run.headBranch);
}

function isFailureRun(config, run) {
  return run.status === 'completed' && config.failureConclusions.includes(run.conclusion);
}

function shouldSuppressBarrierOwnedFailure(run) {
  return run.workflowName === 'Branch Push Health' && hasPendingBarrierForRun(run);
}

function recordObservedRun(workflowState, run) {
  workflowState.runs[String(run.databaseId)] = {
    conclusion: run.conclusion ?? '',
    headBranch: run.headBranch ?? '',
    headSha: run.headSha ?? '',
    observedAt: new Date().toISOString(),
    status: run.status ?? ''
  };
}

function prEvent(config, pr, checks, renderTemplate) {
  const data = buildPrHandoffData(config, pr, checks);
  return {
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', data.eventId),
    prompt: renderTemplate(config.template, data),
    ...data,
    title: data.handoffTitle,
    ttlSeconds: config.defaultTtlSeconds
  };
}

function issueEvent(config, issue, renderTemplate) {
  const data = buildIssueHandoffData(config, issue);
  return {
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', data.eventId),
    prompt: renderTemplate(config.template, data),
    ...data,
    title: data.handoffTitle,
    ttlSeconds: config.defaultTtlSeconds
  };
}

function listActionEvents(config, state, includeExisting, errors, renderTemplate) {
  if (!config?.enabled) return [];
  const events = [];
  const workflows = config.workflows ?? [];
  for (const workflow of workflows) {
    const workflowState = normalizeWorkflowState(state, workflow);
    let runs;
    try {
      runs = runGh([
        'run',
        'list',
        '--repo',
        config.repository,
        '--workflow',
        workflow,
        '--limit',
        '10',
        '--json',
        'databaseId,conclusion,status,displayTitle,headSha,headBranch,url,workflowName,createdAt'
      ]);
    } catch (error) {
      recordMonitorError(errors, 'github-actions', workflow, error);
      continue;
    }
    for (const run of runs) {
      if (!allowedBranch(config, run)) continue;
      const event = actionRunEvent(config, run, renderTemplate);
      const runId = String(run.databaseId);
      const isBaselineRun = workflowState.baselineRunId && runId === workflowState.baselineRunId;
      const shouldEmit = (includeExisting || workflowState.initialized)
        && isFailureRun(config, run)
        && !shouldSuppressBarrierOwnedFailure(run)
        && !state.submitted[event.dedupeKey];
      recordObservedRun(workflowState, run);
      if (shouldEmit) {
        events.push(event);
      }
      if (!includeExisting && isBaselineRun) break;
    }
    workflowState.initialized = true;
    workflowState.latestObservedRunId = String(runs.find((run) => allowedBranch(config, run))?.databaseId ?? '');
    workflowState.lastObservedAt = new Date().toISOString();
  }
  return events;
}

function listPrEvents(config, state, includeExisting, errors, renderTemplate) {
  if (!config?.enabled) return [];
  let prs;
  try {
    prs = runGh([
      'pr',
      'list',
      '--repo',
      config.repository,
      '--state',
      'open',
      '--json',
      'number,title,headRefName,baseRefName,isDraft,author,url,updatedAt',
      '--limit',
      '50'
    ]);
  } catch (error) {
    recordMonitorError(errors, 'github-pr', 'list', error);
    return [];
  }
  const events = [];
  for (const pr of prs) {
    if (pr.isDraft && !config.includeDrafts) continue;
    let checks;
    try {
      checks = listPrChecks(config, pr);
    } catch (error) {
      recordMonitorError(errors, 'github-pr-checks', `#${pr.number}`, error);
      continue;
    }
    const event = prEvent(config, pr, checks, renderTemplate);
    if (!event.failingChecks) continue;
    if (!includeExisting && state.prs[String(pr.number)]) continue;
    events.push(event);
    state.prs[String(pr.number)] = event.eventId;
  }
  return events;
}

function listIssueEvents(config, state, includeExisting, errors, renderTemplate) {
  if (!config?.enabled) return [];
  let issues;
  try {
    issues = runGh([
      'issue',
      'list',
      '--repo',
      config.repository,
      '--state',
      'open',
      '--json',
      'number,title,author,labels,url,updatedAt',
      '--limit',
      String(config.limit ?? 50)
    ]);
  } catch (error) {
    recordMonitorError(errors, 'github-issue', 'list', error);
    return [];
  }
  const events = [];
  for (const issue of issues) {
    const event = issueEvent(config, issue, renderTemplate);
    if (!includeExisting && state.issues[String(issue.number)]) continue;
    events.push(event);
    state.issues[String(issue.number)] = event.eventId;
  }
  return events;
}

export function listGithubMonitorEvents(configs, state, includeExisting, errors, renderTemplate) {
  state.submitted ??= {};
  return [
    ...listActionEvents(configs.actions, state, includeExisting, errors, renderTemplate),
    ...listPrEvents(configs.prs, state, includeExisting, errors, renderTemplate),
    ...listIssueEvents(configs.issues, state, includeExisting, errors, renderTemplate)
  ];
}
