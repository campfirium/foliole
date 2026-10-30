import { buildPrHandoffData } from './github-desktop-handoff-title.mjs';
import { listPrChecks, recordMonitorError, runGh } from './github-monitor-gh.mjs';

function independentPrEvent(config, pr, renderTemplate) {
  const data = buildPrHandoffData(config, pr, listPrChecks(config, pr));
  if (!data.failingChecks) return null;
  return {
    ...data,
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', data.eventId),
    prompt: renderTemplate(config.template, data),
    reconcileOpen: true,
    title: data.handoffTitle,
    ttlSeconds: config.defaultTtlSeconds
  };
}

function wasNotified(config, state, pr) {
  const previousKey = config.dedupeKeyPattern.replace('{eventId}', `${pr.number}:local`);
  return Boolean(state.prs[String(pr.number)] || state.submitted[previousKey]);
}

function batchEvent(config, members, renderTemplate) {
  const sorted = [...members].sort((first, second) => first.number - second.number);
  const prNumbers = sorted.map((pr) => String(pr.number));
  const baseRefName = sorted[0].baseRefName;
  const eventId = `dependabot:${encodeURIComponent(baseRefName)}:${prNumbers.join('-')}`;
  const data = {
    baseRefName, eventId, prNumbers,
    handoffTitle: `Dependabot batch (${prNumbers.length} PRs) -> ${baseRefName}`,
    handlingMode: 'classify-then-handle-batch',
    prList: sorted.map((pr) => (
      `- #${pr.number}: ${pr.title}\n  ${pr.url}\n  Branch: ${pr.headRefName} -> ${pr.baseRefName}; head: ${pr.headRefOid}`
    )).join('\n'),
    repository: config.repository,
    source: 'foliole/github-pr',
    workspace: config.workspace
  };
  return {
    ...data,
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', eventId),
    prompt: renderTemplate(config.batchTemplate, data),
    title: data.handoffTitle,
    ttlSeconds: config.defaultTtlSeconds
  };
}

function collectPrEvents(config, state, prs, errors, renderTemplate) {
  const events = [];
  const batches = new Map();
  for (const pr of prs) {
    if (pr.isDraft && !config.includeDrafts) continue;
    if (pr.author?.login === 'app/dependabot') {
      if (wasNotified(config, state, pr)) continue;
      const members = batches.get(pr.baseRefName) ?? [];
      members.push(pr);
      batches.set(pr.baseRefName, members);
      continue;
    }
    try {
      const event = independentPrEvent(config, pr, renderTemplate);
      if (event) events.push(event);
    } catch (error) {
      recordMonitorError(errors, 'github-pr-checks', `#${pr.number}`, error);
    }
  }
  for (const [branch, members] of batches) {
    try { events.push(batchEvent(config, members, renderTemplate)); }
    catch (error) { recordMonitorError(errors, 'github-pr-batch', branch, error); }
  }
  return events;
}

export function listPrEvents(config, state, errors, renderTemplate) {
  if (!config?.enabled) return [];
  try {
    const prs = runGh([
      'pr', 'list', '--repo', config.repository, '--state', 'open', '--json',
      'number,title,headRefName,headRefOid,baseRefName,isDraft,author,url,updatedAt',
      '--limit', '1000'
    ]);
    const events = collectPrEvents(config, state, prs, errors, renderTemplate);
    state.prsInitialized = true;
    return events;
  } catch (error) {
    recordMonitorError(errors, 'github-pr', 'list', error);
    return [];
  }
}
