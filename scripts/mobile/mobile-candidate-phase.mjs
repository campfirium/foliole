const PHASES = new Set(['upload-unknown', 'uploaded', 'commit-unknown', 'committed', 'observed']);
const PREFIX = 'Play candidate: ';

export async function readMobileStatus(api, id, prefix) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('A durable candidate ID is required');
  let hasHistory = false;
  for (let page = 1; ; page += 1) {
    const rows = await api('GET', `deployments/${id}/statuses?per_page=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error('Durable mobile operation history is unavailable');
    hasHistory ||= rows.length > 0;
    const row = rows.find(item => item.description?.startsWith(prefix));
    if (row) {
      if (row.creator?.login !== 'github-actions[bot]') throw new Error('Durable mobile operation identity differs');
      return { value: row.description.slice(prefix.length), hasHistory };
    }
    if (rows.length < 100) return { value: undefined, hasHistory };
  }
}

export async function readMobileCandidatePhase(api, id) {
  const { value, hasHistory } = await readMobileStatus(api, id, PREFIX);
  if (value === undefined) {
    if (hasHistory) throw new Error('Unknown mobile operation history requires reconciliation');
    return 'signed';
  }
  if (!PHASES.has(value)) throw new Error('Durable mobile operation identity differs');
  return value;
}

export async function writeMobileCandidatePhase(api, id, candidate) {
  if (!Number.isSafeInteger(id) || id < 1 || !PHASES.has(candidate.phase)) throw new Error('Invalid durable Play operation');
  return api('POST', `deployments/${id}/statuses`, { state: candidate.phase === 'observed' ? 'pending' : 'in_progress',
    description: `${PREFIX}${candidate.phase}`, auto_inactive: false,
    log_url: `https://github.com/campfirium/foliole/actions/runs/${candidate.runId}` });
}
