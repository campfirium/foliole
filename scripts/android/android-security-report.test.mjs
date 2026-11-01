// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createAndroidSecurityReport } from './android-security-report.mjs';

function inventory(version = '1.0') {
  const scope = (project, name, kind) => ({ project, name, kind, status: 'resolved',
    modules: [{ group: 'example', name: 'library', version }], unresolved: [], localFiles: [], edges: [] });
  return { schemaVersion: 1, gradleVersion: '8.14.6', java: { version: '21', vendor: 'test' },
    configurations: [scope(':app', 'debugRuntimeClasspath', 'runtime'),
      scope(':app', 'releaseRuntimeClasspath', 'runtime'), scope(':', 'classpath', 'buildscript')] };
}

describe('Android security report completeness', () => {
  it('reports advisory service failures in persisted error details with the affected coordinate', async () => {
    const report = await createAndroidSecurityReport(inventory(), {
      fetchImpl: async () => ({ ok: false, status: 503 })
    });
    expect(report.status).toBe('error');
    expect(report.errors).toContainEqual(expect.objectContaining({ reason: 'advisory-source-failed',
      module: expect.objectContaining({ group: 'example', name: 'library', version: '1.0' }) }));
  });

  it('never labels unsupported coordinates as a successful scoped check', async () => {
    const report = await createAndroidSecurityReport(inventory('unspecified'), {
      fetchImpl: async () => { throw new Error('Unsupported inputs must not be queried'); }
    });
    expect(report.status).toBe('unsupported');
    expect(report.overallStatus).toBe('incomplete');
  });

  it('allows a verified zero-match source result while retaining whole-toolchain coverage gaps', async () => {
    const report = await createAndroidSecurityReport(inventory(), {
      fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{}] }) })
    });
    expect(report.status).toBe('clean');
    expect(report.overallStatus).toBe('incomplete');
    expect(report.gaps.map(gap => gap.asset)).toEqual(expect.arrayContaining(['Gradle distribution', 'JDK']));
    expect(report.advisories.results).toHaveLength(1);
    expect(report.advisories.results[0].module.scopes).toHaveLength(3);
  });

  it('cannot accept a graph that omits a required runtime configuration', async () => {
    const input = inventory();
    input.configurations = input.configurations.filter(scope => scope.name !== 'releaseRuntimeClasspath');
    const report = await createAndroidSecurityReport(input, {
      fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{}] }) })
    });
    expect(report.status).toBe('error');
    expect(report.errors).toContainEqual({ name: 'releaseRuntimeClasspath', reason: 'required-runtime-scope-missing' });
  });
});
