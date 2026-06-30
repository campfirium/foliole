import { buildIssueHandoffData, buildPrHandoffData } from './github-desktop-handoff-title.mjs';
import { listPrChecks, recordMonitorError, runGh } from './github-monitor-gh.mjs';

function actionRunEvent(config, run, renderTemplate) {
  const data = {
    branch: run.headBranch,
    eventId: String(run.databaseId),
    headSha: run.headSha,
    repository: config.repository,
    runId: String(run.databaseId),
    runTitle: run.displayTitle,
    source: 'foliole/github-actions',
    url: run.url,
    workflow: run.workflowName,
    workspace: config.workspace
  };
  return {
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', data.eventId),
    prompt: renderTemplate(config.template, data),
    title: `Foliole Actions failed: ${run.workflowName}`,
    ...data,
    ttlSeconds: config.defaultTtlSeconds
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
    const latestId = String(runs[0]?.databaseId ?? '');
    const seenId = state.actions[workflow];
    if (!includeExisting && !seenId) {
      state.actions[workflow] = latestId;
      continue;
    }
    for (const run of runs) {
      if (!includeExisting && String(run.databaseId) === seenId) break;
      if (run.status === 'completed' && config.failureConclusions.includes(run.conclusion)) {
        events.push(actionRunEvent(config, run, renderTemplate));
      }
    }
    state.actions[workflow] = latestId;
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
  return [
    ...listActionEvents(configs.actions, state, includeExisting, errors, renderTemplate),
    ...listPrEvents(configs.prs, state, includeExisting, errors, renderTemplate),
    ...listIssueEvents(configs.issues, state, includeExisting, errors, renderTemplate)
  ];
}
