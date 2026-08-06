export const COMPANION_DATABASE_PERFORMANCE_GATE_VERSION = 1;

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
      const result = results.find((entry) => entry.platform === platform && entry.workload === workload);
      if (!result) {
        failures.push(`${platform}/${workload}: missing result`);
        continue;
      }
      if (result.gate_version !== COMPANION_DATABASE_PERFORMANCE_GATE_VERSION) {
        failures.push(`${platform}/${workload}: gate version mismatch`);
      }
      if (!(result.native_ms >= 0) || !(result.candidate_ms >= 0)) {
        failures.push(`${platform}/${workload}: invalid timing`);
      }
      const allowedMs = gate.maxCandidateMs ?? Math.max(
        result.native_ms * gate.maxRatio,
        result.timer_resolution_ms ?? 1
      );
      if (result.candidate_ms > allowedMs) {
        failures.push(`${platform}/${workload}: ${result.candidate_ms}ms exceeds ${allowedMs}ms`);
      }
      if ((result.bridge_blob_bytes ?? 0) > gate.maxBridgeBlobBytes) {
        failures.push(`${platform}/${workload}: BLOB bytes crossed the bridge`);
      }
      if ((result.candidate_peak_delta_bytes ?? 0) > Math.max(
        (result.native_peak_delta_bytes ?? 0) * 10,
        64 * 1024 * 1024
      )) {
        failures.push(`${platform}/${workload}: candidate memory grew by an order of magnitude`);
      }
      if (result.cleanup_verified !== true) failures.push(`${platform}/${workload}: cleanup not verified`);
    }
  }
  return { failures, passed: failures.length === 0 };
}
