import type { KeepImportRuleConfig } from './keepImportService.js';

interface KeepImportRunOwnerSession<T> {
  promise: Promise<T>;
  sourceType: KeepImportRuleConfig['sourceType'];
}

const sessionsByRuleId = new Map<string, KeepImportRunOwnerSession<unknown>>();

export function requestKeepImportRun<T>(
  config: KeepImportRuleConfig,
  run: () => Promise<T>
): Promise<T> {
  const existing = sessionsByRuleId.get(config.ruleId) as KeepImportRunOwnerSession<T> | undefined;
  if (existing) {
    return existing.promise;
  }
  const session = {
    sourceType: config.sourceType,
    promise: run().finally(() => {
      if (sessionsByRuleId.get(config.ruleId) === session) {
        sessionsByRuleId.delete(config.ruleId);
      }
    })
  };
  sessionsByRuleId.set(config.ruleId, session);
  return session.promise;
}

export function hasActiveReadwiseKeepImportRuns() {
  return [...sessionsByRuleId.values()].some((session) => session.sourceType === 'readwise');
}
