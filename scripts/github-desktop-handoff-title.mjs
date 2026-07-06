import { getPrCheckSignal } from './github-monitor-gh.mjs';

export function buildPrHandoffData(config, pr, checks) {
  const checkSignal = getPrCheckSignal(config, checks);
  const number = String(pr.number);
  const noChecks = checkSignal.eventSuffix === 'no-checks';
  const handoffTitle = noChecks
    ? `PR #${number} needs PR handling`
    : `PR #${number} failed: ${checkSignal.label}`;

  return {
    author: pr.author?.login ?? pr.author?.name ?? '',
    baseRefName: pr.baseRefName,
    checkSignalSuffix: checkSignal.eventSuffix,
    eventId: `${number}:${checkSignal.eventSuffix}`,
    failingChecks: checkSignal.label,
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
