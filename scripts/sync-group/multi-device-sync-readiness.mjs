import { HOSTS } from './multi-device-sync-contract.mjs';

/* global clearTimeout, setTimeout */

export const ENVIRONMENT_READINESS_TIMEOUT_MS = 45_000;

function nowIso(now) {
  return new Date(now()).toISOString();
}

function blocked(host, startedAt, now, missingFact, lastSuccessfulAction = 'readiness_started') {
  const completedAt = nowIso(now);
  return { completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    failureOwner: 'environment', host, inputFacts: [], lastProgressAt: startedAt,
    lastSuccessfulAction, missingFact, outputFacts: [], stage: 'environment-readiness',
    startedAt, status: 'blocked' };
}

function passed(host, startedAt, now, facts) {
  const completedAt = nowIso(now);
  return { completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    failureOwner: 'environment', host, inputFacts: [], lastProgressAt: completedAt,
    outputFacts: facts, stage: 'environment-readiness', startedAt, status: 'passed' };
}

async function withDeadline(action, timeoutMs, timeout, host, startedAt, now) {
  let timer;
  try {
    return await Promise.race([
      action(),
      new Promise((resolve) => { timer = timeout(() => resolve(
        blocked(host, startedAt, now, 'readiness_deadline_exceeded')
      ), timeoutMs); })
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function collectEnvironmentReadiness({ adapters, now = Date.now,
  hosts = HOSTS, timeout = setTimeout, timeoutMs = ENVIRONMENT_READINESS_TIMEOUT_MS }) {
  const startedAt = nowIso(now);
  const receipts = await Promise.all(hosts.map(async (host) => {
    const adapter = adapters[host];
    if (typeof adapter !== 'function') return blocked(host, startedAt, now, 'adapter_unbound');
    try {
      const result = await withDeadline(adapter, timeoutMs, timeout, host, startedAt, now);
      if (result?.stage === 'environment-readiness') return result;
      if (!Array.isArray(result?.facts) || result.facts.length === 0) {
        return blocked(host, startedAt, now, 'readiness_facts_missing');
      }
      return passed(host, startedAt, now, result.facts);
    } catch (error) {
      return blocked(host, startedAt, now, error.missingFact || 'readiness_exception',
        error.lastSuccessfulAction || 'adapter_started');
    }
  }));
  return {
    allReady: receipts.every(({ status }) => status === 'passed'), receipts,
    startedAt, status: receipts.every(({ status }) => status === 'passed') ? 'passed' : 'blocked'
  };
}
