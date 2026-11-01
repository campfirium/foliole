import { buildPrHandoffData } from './github-desktop-handoff-title.mjs';
import { listPrChecks, recordMonitorError, runGh } from './github-monitor-gh.mjs';

const NATIVE_REVIEW_POLICY = [
  'Native dependency review boundary:',
  'Inspect the verified full diff before classifying each proposal; titles and branch names do not establish dependency intent.',
  'Any Gradle build or Wrapper changes, Swift Package.swift or Package.resolved changes, or mixed source changes require manual review.',
  'Do not adopt these proposals in this handoff, execute their proposed scripts, or close their PRs; report the exact changes and leave them open for explicit adoption authorization.',
  'Review Wrapper scripts and JAR provenance against the official distribution and checksum before any later adoption.',
  'For Swift updates, review both SwiftProtobuf exact constraints and the App and host lock files together; generated Capacitor manifests follow npm ownership.',
  'Other verified npm proposals retain the existing adoption and Electron eligibility requirements.',
  'See docs/maintenance/native-dependency-updates.md for ownership, validation and coverage limits.'
].join('\n');

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

function batchEvent(config, members, renderTemplate, batchKey) {
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
    dependabotBatchKey: batchKey,
    dedupeKey: config.dedupeKeyPattern.replace('{eventId}', eventId),
    prompt: `${renderTemplate(config.batchTemplate, data)}\n\n${NATIVE_REVIEW_POLICY}`,
    title: data.handoffTitle,
    ttlSeconds: config.defaultTtlSeconds
  };
}

function batchReady(config, state, members, batchKey) {
  const now = Date.now();
  const prNumbers = members.map(pr => String(pr.number));
  const pending = state.dependabotBatches[batchKey] ?? {
    firstObservedAt: now, lastArrivalAt: now, prNumbers: []
  };
  if (prNumbers.some(number => !pending.prNumbers.includes(number))) {
    pending.lastArrivalAt = now;
  }
  pending.prNumbers = prNumbers;
  state.dependabotBatches[batchKey] = pending;
  const quietMs = (config.batchQuietSeconds ?? 300) * 1000;
  const maxWaitMs = (config.batchMaxWaitSeconds ?? 1800) * 1000;
  return now - pending.lastArrivalAt >= quietMs || now - pending.firstObservedAt >= maxWaitMs;
}

function clearEmptyBatches(config, state, batches) {
  for (const batchKey of Object.keys(state.dependabotBatches)) {
    const [repository, branch] = JSON.parse(batchKey);
    if (repository === config.repository && !batches.has(branch)) {
      delete state.dependabotBatches[batchKey];
    }
  }
}

function collectPrEvents(config, state, prs, errors, renderTemplate) {
  const events = [];
  const batches = new Map();
  state.dependabotBatches ??= {};
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
  clearEmptyBatches(config, state, batches);
  for (const [branch, members] of batches) {
    const batchKey = JSON.stringify([config.repository, branch]);
    if (!batchReady(config, state, members, batchKey)) continue;
    try { events.push(batchEvent(config, members, renderTemplate, batchKey)); }
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
