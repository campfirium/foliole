import { buildIssueHandoffData, buildPrHandoffData } from './github-desktop-handoff-title.mjs';
import { buildActionsHandoffIdentity } from './github-actions-handoff-policy.mjs';
import { dependabotPrCanEmit } from './github-dependabot-pr-eligibility.mjs';
import { listDependabotAlertEvents } from './github-dependabot-alert-events.mjs';
import { listPrChecks, recordMonitorError, runGh } from './github-monitor-gh.mjs';

function actionRunEvent(config, workflowSelector, run, renderTemplate, identity) {
  const data = {
    branch: run.headBranch,
    eventId: String(run.databaseId),
    headSha: run.headSha,
    repository: config.repository,
    runId: String(run.databaseId),
    runTitle: run.displayTitle,
    source: 'foliole/github-actions',
    triggerEvent: run.event ?? 'unknown',
    url: run.url,
    workflow: run.workflowName,
    workspace: config.workspace,
    ...identity
  };
  return {
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', data.eventId),
    prompt: renderTemplate(config.template, data),
    reconcileOpen: true,
    title: identity.handoffTitle,
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
    runs: existing ? { [String(existing)]: { status: 'unknown' } } : {},
  };
  state.actions[workflow] = normalized;
  return normalized;
}

function allowedBranch(config, run) {
  return (config.branches ?? []).length === 0 || (config.branches ?? []).includes(run.headBranch);
}

function isFailureRun(config, run) {
  return run.status === 'completed' && config.failureConclusions.includes(run.conclusion);
}


function isRecordedFailure(config, run) {
  return run?.status === 'completed' && config.failureConclusions.includes(run.conclusion);
}

function recordObservedRun(config, workflowState, run, includeExisting) {
  const runId = String(run.databaseId);
  const previous = workflowState.runs[runId];
  const legacyBaseline = workflowState.baselineRunId === runId && previous?.status === 'unknown';
  const handoffEligible = isFailureRun(config, run)
    ? includeExisting || previous?.handoffEligible
      || (workflowState.initialized && !legacyBaseline && !isRecordedFailure(config, previous))
    : false;
  const observed = {
    conclusion: run.conclusion ?? '',
    handoffEligible: Boolean(handoffEligible),
    headBranch: run.headBranch ?? '',
    headSha: run.headSha ?? '',
    observedAt: new Date().toISOString(),
    status: run.status ?? ''
  };
  workflowState.runs[runId] = observed;
  return observed;
}

function prEvent(config, pr, checks, renderTemplate) {
  const data = buildPrHandoffData(config, pr, checks);
  return {
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', data.eventId),
    prompt: renderTemplate(config.template, data),
    reconcileOpen: true,
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
        'databaseId,conclusion,status,displayTitle,headSha,headBranch,url,workflowName,createdAt,event'
      ]);
    } catch (error) {
      recordMonitorError(errors, 'github-actions', workflow, error);
      continue;
    }
    const latestAllowedRunId = String(runs.find((candidate) => allowedBranch(config, candidate))?.databaseId ?? '');
    for (const run of runs) {
      if (!allowedBranch(config, run)) continue;
      const identity = buildActionsHandoffIdentity(workflow, run);
      if (!identity) continue;
      const runId = String(run.databaseId);
      const observed = recordObservedRun(config, workflowState, run, includeExisting || runId === latestAllowedRunId);
      if (runId !== latestAllowedRunId) continue;
      if (!observed.handoffEligible) continue;
      events.push(actionRunEvent(config, workflow, run, renderTemplate, identity));
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
      'number,title,headRefName,headRefOid,baseRefName,isDraft,author,url,updatedAt',
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
    if (!dependabotPrCanEmit({ config, errors, pr, recordError: recordMonitorError, runGh })) continue;
    let checks;
    try {
      checks = listPrChecks(config, pr);
    } catch (error) {
      recordMonitorError(errors, 'github-pr-checks', `#${pr.number}`, error);
      continue;
    }
    const event = prEvent(config, pr, checks, renderTemplate);
    if (!event.failingChecks) continue;
    events.push(event);
  }
  state.prsInitialized = true;
  return events;
}

function listIssueEvents(config, state, includeExisting, errors, renderTemplate) {
  if (!config?.enabled) return [];
  const initialized = Boolean(state.issuesInitialized);
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
    if (includeExisting || initialized) events.push(event);
    state.issues[String(issue.number)] = event.eventId;
  }
  state.issuesInitialized = true;
  return events;
}

export function listGithubMonitorEvents(configs, state, includeExisting, errors, renderTemplate) {
  state.submitted ??= {};
  return [
    ...listDependabotAlertEvents(configs.dependabotAlerts, state, errors, renderTemplate),
    ...listActionEvents(configs.actions, state, includeExisting, errors, renderTemplate),
    ...listPrEvents(configs.prs, state, includeExisting, errors, renderTemplate),
    ...listIssueEvents(configs.issues, state, includeExisting, errors, renderTemplate)
  ];
}
