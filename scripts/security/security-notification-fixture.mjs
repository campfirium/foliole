import { SECURITY_COVERAGE } from './security-coverage.mjs';
import { digest } from './security-inputs.mjs';

// Complete report input for production-path owner/notification integration tests.
export function notificationObservation(now, { id = 1, version = '1.0.0', status = 'findings' } = {}) {
  const candidate = { revision: 'a'.repeat(40), inputDigest: 'b'.repeat(64) };
  const rawLock = JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/example': { version } } });
  const report = { schemaVersion: 1, generatedAt: new Date(now).toISOString(), overallStatus: 'incomplete',
    snapshot: { candidate, mode: 'working-tree', inputs: { 'package-lock.json': digest(rawLock) },
      tools: { platform: 'linux', arch: 'x64' } },
    coverage: SECURITY_COVERAGE.map(asset => ({ id: asset.id, checks: asset.routes.map(route => ({
      route: route.id, candidate, status: asset.id === 'npm-build' ? status : 'clean',
      reason: status === 'error' ? 'source unavailable' : undefined,
      findings: asset.id === 'npm-build' && status === 'findings' ? [{ name: 'example', nodes: ['node_modules/example'],
        via: [{ name: 'example', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'high', range: '<2.0.0' }] }] : []
    })) })) };
  return { rawReport: JSON.stringify(report), rawLock, now,
    envelope: { repository: 'campfirium/foliole', headSha: candidate.revision, kind: 'local', artifactId: id } };
}
