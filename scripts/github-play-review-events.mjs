import { verifyStoredMobileCandidate } from './mobile/mobile-candidate-store.mjs';
import { MOBILE_TASK, PLAY_CANDIDATE_ENVIRONMENT } from './mobile/mobile-candidate-provenance.mjs';
import { recordMonitorError, runGh } from './github-monitor-gh.mjs';

function readPages(repository, route, query) {
  const pages = query(['api', `repos/${repository}/${route}`, '--paginate', '--slurp']);
  if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page))) {
    throw new Error('Play review notification inventory is unavailable');
  }
  return pages.flat();
}

function latestStatus(statuses, prefix) {
  const row = statuses.find(item => item.description?.startsWith(prefix));
  if (row && row.creator?.login !== 'github-actions[bot]') throw new Error('Play review status ownership differs');
  return row?.description.slice(prefix.length);
}

function candidateEvents(config, row, statuses, renderTemplate) {
  if (latestStatus(statuses, 'Play candidate: ') !== 'observed') return [];
  const review = latestStatus(statuses, 'Play review: ');
  const availability = latestStatus(statuses, 'Play availability: ');
  const signals = [];
  if (['APPROVED_NOT_PUBLISHED', 'PUBLISHED'].includes(review)) signals.push('approved');
  if (review === 'NOT_APPROVED') signals.push('rejected');
  if (availability === 'available' && review === 'PUBLISHED') signals.push('available');
  const labels = { approved: 'review approved', rejected: 'review rejected', available: 'available to testers' };
  return signals.map(signal => {
    const candidate = row.payload.candidate;
    const eventId = `${row.id}:${signal}`;
    const data = { source: 'foliole/google-play-review', eventId, signal, repository: config.repository,
      deploymentId: row.id, version: candidate.version, versionCode: candidate.versionCode,
      track: candidate.track, lifecycle: review, workspace: config.workspace,
      sourceSha: row.payload.sourceSha, runId: row.payload.runId,
      url: `https://github.com/${config.repository}/actions/runs/${row.payload.runId}` };
    return { ...data, dedupeKey: config.dedupeKeyPattern.replace('{eventId}', eventId),
      title: `Android ${candidate.version} (${candidate.versionCode}): ${labels[signal]}`,
      prompt: renderTemplate(config.template, data), ttlSeconds: config.defaultTtlSeconds };
  });
}

export function listPlayReviewEvents(config, state, includeExisting, errors, renderTemplate, query = runGh) {
  if (!config?.enabled) return [];
  try {
    if (config.repository !== 'campfirium/foliole') throw new Error('Play review repository differs');
    const rows = readPages(config.repository,
      `deployments?task=${MOBILE_TASK}&environment=${PLAY_CANDIDATE_ENVIRONMENT}&per_page=100`, query);
    const events = rows.flatMap(entry => {
      const row = verifyStoredMobileCandidate(entry);
      return candidateEvents(config, row, readPages(config.repository,
        `deployments/${row.id}/statuses?per_page=100`, query), renderTemplate);
    });
    if (!state.playReviewBaseline) {
      state.playReviewBaseline = includeExisting ? [] : events.map(event => event.dedupeKey);
    }
    return events.filter(event => includeExisting || !state.playReviewBaseline.includes(event.dedupeKey));
  } catch (error) {
    recordMonitorError(errors, 'google-play-review', 'registered candidates', error);
    return [];
  }
}
