import { getPrCheckSignal } from './github-monitor-gh.mjs';

export function buildPrHandoffData(config, pr, checks) {
  const checkSignal = getPrCheckSignal(config, checks);
  const number = String(pr.number);
  const noChecks = checkSignal.eventSuffix === 'no-checks';
  const handoffTitle = noChecks
    ? `PR #${number} needs checks`
    : `PR #${number} failed: ${checkSignal.label}`;

  return {
    author: pr.author?.login ?? pr.author?.name ?? '',
    baseRefName: pr.baseRefName,
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
