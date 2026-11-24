import { recordMonitorError, runGh } from './github-monitor-gh.mjs';

// GitHub throttles the hosted schedule of deploy-release-manifest.yml to a few runs a day, so the
// local monitor dispatches it while a published Release still shows a store review in progress.
export const STORE_REVIEW_MARKER = '(In Review)';
export const STORE_REVIEW_WORKFLOW = 'deploy-release-manifest.yml';
export const STORE_REVIEW_CHECK_INTERVAL_MS = 10 * 60 * 1000;
export const STORE_REVIEW_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SOURCE = 'foliole/store-review-dispatch';

// Only the newest published Release counts: an older one left at "(In Review)" never resolves.
export function pendingStoreReviewTags(releases, now) {
  const latest = (releases ?? []).find((release) => release?.draft === false && release.published_at);
  if (!latest || now - Date.parse(latest.published_at) > STORE_REVIEW_MAX_AGE_MS) return [];
  return typeof latest.body === 'string' && latest.body.includes(STORE_REVIEW_MARKER) ? [latest.tag_name] : [];
}

export function dispatchPendingStoreReview(state, { repository, now = Date.now(), gh = runGh, errors = [] } = {}) {
  const previous = state.storeReviewDispatch ?? {};
  if (now - Date.parse(previous.checkedAt ?? '') < STORE_REVIEW_CHECK_INTERVAL_MS) return previous;
  const record = { checkedAt: new Date(now).toISOString(), pending: [], dispatchedAt: previous.dispatchedAt };
  state.storeReviewDispatch = record;
  try {
    record.pending = pendingStoreReviewTags(gh(['api', `repos/${repository}/releases?per_page=10`]), now);
    if (!record.pending.length) return record;
    const runs = gh(['api', `repos/${repository}/actions/workflows/${STORE_REVIEW_WORKFLOW}/runs?branch=dev&per_page=10`]);
    if ((runs?.workflow_runs ?? []).some((run) => run.status !== 'completed')) {
      record.skipped = 'run-active';
      return record;
    }
    gh(['api', '--method', 'POST', `repos/${repository}/actions/workflows/${STORE_REVIEW_WORKFLOW}/dispatches`,
      '-f', 'ref=dev', '-f', 'inputs[monitor]=true']);
    record.dispatchedAt = record.checkedAt;
  } catch (error) {
    recordMonitorError(errors, SOURCE, repository, error);
    record.error = error instanceof Error ? error.message : String(error);
  }
  return record;
}
