export function npmAuditObservation(result, { asset, candidate, environment, checkedAt }) {
  const base = { asset, route: 'npm-audit', candidate, environment, checkedAt, source: 'npm audit lock-only' };
  try {
    if (![0, 1].includes(result.status) || result.error || result.signal) {
      throw new Error(result.error?.message ?? `npm audit process failed (${result.status ?? result.signal})`);
    }
    const report = JSON.parse(result.stdout);
    const counts = report.metadata?.vulnerabilities;
    if (report.error || report.auditReportVersion !== 2 || !counts || !report.vulnerabilities
      || Array.isArray(report.vulnerabilities) || typeof report.vulnerabilities !== 'object'
      || !['total', 'high', 'critical', 'moderate', 'low', 'info'].every(key => Number.isInteger(counts[key]) && counts[key] >= 0)) {
      throw new Error('Missing, malformed or failed npm audit source response');
    }
    const findings = Object.values(report.vulnerabilities);
    if (counts.total === 0 && result.status !== 0) throw new Error('Zero-match audit returned a failing process status');
    if (counts.total === 0 && findings.length) throw new Error('Inconsistent npm audit zero-match response');
    if (counts.total > 0 && !findings.length) throw new Error('npm audit findings details missing');
    return { ...base, status: counts.total ? 'findings' : 'clean', counts, findings };
  } catch (error) {
    return { ...base, status: 'error', reason: error.message, findings: [] };
  }
}
