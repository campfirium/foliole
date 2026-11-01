// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { collectAndroidDependencySecurity } from './android-dependency-security.mjs';
import { prepareAndroidSecurityFixture } from './android-security-fixture.mjs';
import { createAndroidSecurityReport } from './android-security-report.mjs';
import { execute } from './macos-a5-process.mjs';
import { macosA5GradleEnv } from './macos-a5-runtime-paths.mjs';

let root;
const reportOptions = {};
const success = async () => ({ ok: true, json: async () => ({ results: [] }) });

beforeAll(() => {
  const artifacts = path.resolve('.tmp/artifacts/T674/android-security-tests');
  mkdirSync(artifacts, { recursive: true });
  root = mkdtempSync(path.join(artifacts, 'resolution-'));
  prepareAndroidSecurityFixture(root);
  Object.assign(reportOptions, { projectRoot: root, gradle: path.resolve('android/gradlew'),
    initScript: path.resolve('scripts/android/android-dependency-inventory.gradle'),
    env: process.platform === 'darwin' ? macosA5GradleEnv() : process.env, execute, source: { mode: 'integration-fixture' } });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe.runIf(process.platform !== 'win32')('resolved Android inventory through advisory results', () => {
  it('uses selected transitive versions, separates runtime variants and persists source findings', async () => {
    const queries = [];
    const fetchImpl = async (_url, options) => {
      const body = JSON.parse(options.body);
      queries.push(...body.queries);
      return { ok: true, json: async () => ({ results: body.queries.map(query => (
        query.package.name === 'example:leaf' && query.version === '1.0'
          ? { vulns: [{ id: 'FIXTURE-LEAF-1' }] } : {}
      )) }) };
    };
    const { report, reportPath } = await collectAndroidDependencySecurity({ ...reportOptions,
      outputDir: path.join(root, 'report'), fetchImpl });
    expect(report.status).toBe('findings');
    expect(report.inventory.java.home).toBeTruthy();
    expect(report.inventory.java.trustStore.certificates.length).toBeGreaterThan(0);
    expect(report.inventory.java.trustStore.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(report.overallStatus).toBe('incomplete');
    const runtime = name => report.inventory.configurations.find(row => row.name === name);
    expect(runtime('debugRuntimeClasspath').modules).toContainEqual({ group: 'example', name: 'leaf', version: '2.0' });
    expect(runtime('debugRuntimeClasspath').modules).not.toContainEqual({ group: 'example', name: 'leaf', version: '1.0' });
    expect(runtime('releaseRuntimeClasspath').modules).toContainEqual({ group: 'example', name: 'leaf', version: '1.0' });
    expect(runtime('debugRuntimeClasspath').edges.some(edge => edge.requested === 'example:leaf:1.0'
      && edge.selected === 'example:leaf:2.0')).toBe(true);
    expect(queries.map(query => `${query.package.name}:${query.version}`))
      .toEqual(expect.arrayContaining(['example:leaf:1.0', 'example:leaf:2.0', 'example:build-tool:1.0']));
    expect(report.findings[0].module.scopes).toEqual([':app:runtime:releaseRuntimeClasspath']);
    expect(report.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'local-files-have-no-maven-identity', files: ['local.jar'] }),
      expect.objectContaining({ asset: 'Gradle distribution' }), expect.objectContaining({ asset: 'JDK' })
    ]));
    expect(JSON.parse(readFileSync(reportPath, 'utf8')).findings).toEqual(report.findings);
    expect(report.source.inventorySha256).toMatch(/^[a-f0-9]{64}$/u);
  }, 90_000);

  it('keeps unresolved dependencies visible rather than returning a clean partial graph', async () => {
    const buildFile = path.join(root, 'app/build.gradle');
    const original = readFileSync(buildFile, 'utf8');
    writeFileSync(buildFile, `${original}\ndependencies { releaseRuntimeClasspath 'example:absent:1.0' }\n`);
    try {
      const { report, reportPath } = await collectAndroidDependencySecurity({ ...reportOptions,
        outputDir: path.join(root, 'unresolved'), fetchImpl: async (_url, options) => ({
          ok: true, json: async () => ({ results: JSON.parse(options.body).queries.map(() => ({})) })
        }) });
      expect(report.status).toBe('error');
      expect(report.errors).toContainEqual(expect.objectContaining({ name: 'releaseRuntimeClasspath' }));
      expect(JSON.parse(readFileSync(reportPath, 'utf8')).overallStatus).toBe('incomplete');
    } finally { writeFileSync(buildFile, original); }
  }, 90_000);

  it('persists a source error when Gradle cannot produce an inventory', async () => {
    const { reportPath } = await collectAndroidDependencySecurity({ ...reportOptions,
      outputDir: path.join(root, 'failed'), gradle: '/nonexistent/gradle', fetchImpl: success });
    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({ status: 'error', overallStatus: 'incomplete' });
  });

  it('does not qualify a successful tool step when GitHub says the snapshot was superseded', async () => {
    const receipt = path.join(root, 'superseded.json');
    const revision = 'a'.repeat(40);
    writeFileSync(receipt, JSON.stringify({ schemaVersion: 1, expected: revision, status: 'error',
      checkedAt: new Date().toISOString(), submissions: [{ result: { result: 'ACCEPTED', message: 'superseded' } }] }));
    const { report } = await collectAndroidDependencySecurity({ ...reportOptions,
      outputDir: path.join(root, 'superseded-report'), source: { revision },
      env: { ...reportOptions.env, GITHUB_ACTIONS: 'true', FOLIOLE_ANDROID_GRAPH_STATUS: 'success',
        FOLIOLE_ANDROID_SUBMISSION_RECEIPT: receipt },
      fetchImpl: async (_url, options) => ({ ok: true, json: async () => ({ results: JSON.parse(options.body).queries.map(() => ({})) }) }) });
    expect(report.officialObservations.find(row => row.route === 'dependency-submission').status).toBe('error');
    expect(report.inventory.configurations.some(row => row.name === 'debugRuntimeClasspath')).toBe(true);
  }, 90_000);

  it('refuses an empty or malformed inventory before querying any advisory service', async () => {
    await expect(createAndroidSecurityReport({}, { fetchImpl: success })).rejects.toThrow('inventory');
  });
});
