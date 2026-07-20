import { getPrCheckSignal } from './github-monitor-gh.mjs';

export function buildPrHandoffData(config, pr, checks) {
  const number = String(pr.number);
  const autoHandle = (config.autoHandleAuthors ?? []).includes(pr.author?.login);
  const checkSignal = autoHandle
    ? { eventSuffix: `auto:${pr.headRefOid ?? pr.updatedAt ?? number}`, label: 'Automatic Dependabot handling' }
    : getPrCheckSignal(config, checks);
  const noChecks = checkSignal.eventSuffix === 'no-checks';
  const handoffTitle = autoHandle
    ? `PR #${number} automatic Dependabot handling`
    : noChecks
    ? `PR #${number} needs PR handling`
    : `PR #${number} failed: ${checkSignal.label}`;

  return {
    author: pr.author?.login ?? pr.author?.name ?? '',
    baseRefName: pr.baseRefName,
    checkSignalSuffix: checkSignal.eventSuffix,
    eventId: `${number}:${checkSignal.eventSuffix}`,
    failingChecks: checkSignal.label,
    handlingMode: autoHandle ? 'automatic-dependabot' : 'review',
    handoffTitle,
    headRefName: pr.headRefName,
    number,
    prTitle: pr.title,
    repository: config.repository,
    source: 'foliole/github-pr',
    url: pr.url,
    workspace: config.workspace
  };
}

export function buildIssueHandoffData(config, issue) {
  const number = String(issue.number);
  const labels = (issue.labels ?? [])
    .map((label) => label.name)
    .filter(Boolean)
    .join(', ');

  return {
    author: issue.author?.login ?? issue.author?.name ?? '',
    eventId: number,
    handoffTitle: `Issue #${number}: ${issue.title}`,
    issueTitle: issue.title,
    labels,
    number,
    repository: config.repository,
    source: 'foliole/github-issue',
    updatedAt: issue.updatedAt ?? '',
    url: issue.url,
    workspace: config.workspace
  };
}
