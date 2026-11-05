const PHASES = new Set(['upload-unknown', 'uploaded', 'commit-unknown', 'committed', 'observed']);
const PREFIX = 'Play candidate: ';

export async function readMobileCandidatePhase(api, id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('A durable candidate ID is required');
  const rows = await api('GET', `deployments/${id}/statuses?per_page=100`);
  if (!Array.isArray(rows)) throw new Error('Durable mobile operation history is unavailable');
  const phase = rows.find(row => row.description?.startsWith(PREFIX));
  if (!phase) {
    if (rows.length) throw new Error('Unknown mobile operation history requires reconciliation');
    return 'signed';
  }
  const value = phase.description.slice(PREFIX.length);
  if (phase.creator?.login !== 'github-actions[bot]' || !PHASES.has(value)) throw new Error('Durable mobile operation identity differs');
  return value;
}

export async function writeMobileCandidatePhase(api, id, candidate) {
  if (!Number.isSafeInteger(id) || id < 1 || !PHASES.has(candidate.phase)) throw new Error('Invalid durable Play operation');
  return api('POST', `deployments/${id}/statuses`, { state: candidate.phase === 'observed' ? 'pending' : 'in_progress',
    description: `${PREFIX}${candidate.phase}`, auto_inactive: false,
    log_url: `https://github.com/campfirium/foliole/actions/runs/${candidate.runId}` });
}
