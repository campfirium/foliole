export const COMPANION_DATABASE_PERFORMANCE_GATE_VERSION = 2;

export const COMPANION_DATABASE_PERFORMANCE_WORKLOADS = Object.freeze({
  control_write: { maxRatio: 2, maxBridgeBlobBytes: 0 },
  hydrate_1293: { maxCandidateMs: 100, maxBridgeBlobBytes: 0 },
  attach_100mb: { maxRatio: 2, maxBridgeBlobBytes: 0 },
  content_448_4mb: { maxRatio: 2, maxBridgeBlobBytes: 0 },
  attachments_21_32mb: { maxCandidateMs: 100, maxBridgeBlobBytes: 0 }
});

export function parseCompanionDatabasePerformanceOutput(output) {
  const prefix = 'FOLIOLE_DATABASE_PERFORMANCE_RESULT=';
  return String(output).split(/\r?\n/u)
    .map((line) => line.includes(prefix) ? line.slice(line.indexOf(prefix) + prefix.length).trim() : '')
    .filter(Boolean)
    .map((value) => JSON.parse(value));
}

export function evaluateCompanionDatabasePerformanceResults(results, expectedPlatforms = ['android', 'ios']) {
  const failures = [];
  for (const platform of expectedPlatforms) {
    for (const [workload, gate] of Object.entries(COMPANION_DATABASE_PERFORMANCE_WORKLOADS)) {
      const matches = results.filter((entry) => entry?.platform === platform && entry.workload === workload);
      const [result] = matches;
      if (!result) {
        failures.push(`${platform}/${workload}: missing result`);
        continue;
      }
      if (matches.length !== 1) failures.push(`${platform}/${workload}: duplicate results`);
      if (result.gate_version !== COMPANION_DATABASE_PERFORMANCE_GATE_VERSION) {
        failures.push(`${platform}/${workload}: gate version mismatch`);
      }
      evaluateMeasurement(result, gate, `${platform}/${workload}`, failures);
    }
  }
  return { failures, passed: failures.length === 0 };
}

function evaluateMeasurement(result, gate, label, failures) {
  const valid = new Set();
  for (const field of ['native_ms', 'candidate_ms', 'timer_resolution_ms',
    'bridge_blob_bytes', 'native_peak_delta_bytes', 'candidate_peak_delta_bytes']) {
    const value = result[field];
    const legal = typeof value === 'number' && Number.isFinite(value) && value >= 0
      && (field !== 'timer_resolution_ms' || value > 0)
      && (!field.endsWith('_bytes') || Number.isSafeInteger(value));
    if (legal) valid.add(field);
    else failures.push(`${label}: invalid ${field} (${String(value)})`);
  }
  if (['native_ms', 'candidate_ms', 'timer_resolution_ms'].every((field) => valid.has(field))) {
    const allowedMs = gate.maxCandidateMs ?? Math.max(result.native_ms * gate.maxRatio, result.timer_resolution_ms);
    if (result.candidate_ms > allowedMs) failures.push(`${label}: ${result.candidate_ms}ms exceeds ${allowedMs}ms`);
  }
  if (result.execution_scope === 'native_direct' || result.bridge_observation !== 'observed') {
    const reason = result.execution_scope === 'native_direct' ? 'native_direct' : result.bridge_observation ?? 'missing';
    failures.push(`${label}: bridge observation not verified (${reason})`);
  }
  if (valid.has('bridge_blob_bytes') && result.bridge_blob_bytes > gate.maxBridgeBlobBytes) {
    failures.push(`${label}: BLOB bytes crossed the bridge`);
  }
  if (valid.has('native_peak_delta_bytes') && valid.has('candidate_peak_delta_bytes')
    && result.candidate_peak_delta_bytes > Math.max(result.native_peak_delta_bytes * 10, 64 * 1024 * 1024)) {
    failures.push(`${label}: candidate memory grew by an order of magnitude`);
  }
  if (result.cleanup_verified !== true) failures.push(`${label}: cleanup not verified`);
}
