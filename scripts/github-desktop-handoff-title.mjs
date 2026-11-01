import { getPrCheckSignal } from './github-monitor-gh.mjs';

export function buildPrHandoffData(config, pr, checks) {
  const number = String(pr.number);
  const dependabotHandoff = pr.author?.login === 'app/dependabot';
  let checkSignal = dependabotHandoff
    ? { eventSuffix: 'local', label: 'Dependabot update proposal' }
    : getPrCheckSignal(config, checks);
  const renovateProposal = pr.author?.login === 'app/renovate'
    && ['', 'no-checks'].includes(checkSignal.eventSuffix);
  if (renovateProposal) {
    checkSignal = { eventSuffix: 'proposal', label: 'Renovate update proposal' };
  }
  const noChecks = checkSignal.eventSuffix === 'no-checks';
  const handoffTitle = dependabotHandoff
    ? `PR #${number} Dependabot update`
    : renovateProposal
    ? `PR #${number} Renovate update for review`
    : noChecks
    ? `PR #${number} needs PR handling`
    : `PR #${number} failed: ${checkSignal.label}`;

  return {
    author: pr.author?.login ?? pr.author?.name ?? '',
    baseRefName: pr.baseRefName,
    checkSignalSuffix: checkSignal.eventSuffix,
    eventId: `${number}:${checkSignal.eventSuffix}`,
    failingChecks: checkSignal.label,
    handlingMode: dependabotHandoff ? 'classify-then-handle' : 'review',
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
