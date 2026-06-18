// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCAN_SCRIPT = path.join(REPO_ROOT, 'scripts/sync/sql-surface-scan.mjs');
const TEMP_ROOT_BASE = path.join(REPO_ROOT, '.tmp', 'tests');

function runScan(rootDir) {
  return new Promise((resolve) => {
    const child = spawn('node', [SCAN_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, SQL_SURFACE_SCAN_ROOTS: rootDir }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stderr, stdout });
    });
  });
}

function completeSqlSurface(extra = '') {
  return `
const attach = \`ATTACH DATABASE 'incoming.db' AS incoming\`;
const detach = \`DETACH DATABASE incoming\`;
const insertSelect = \`
  INSERT OR REPLACE INTO main.nodes (id, body)
  SELECT id, body FROM incoming.nodes
  WHERE EXISTS (SELECT 1 FROM incoming.nodes AS n WHERE n.id = nodes.id)
\`;
const transaction = \`BEGIN; COMMIT;\`;
const join = \`SELECT * FROM main.nodes JOIN incoming.nodes ON incoming.nodes.id = main.nodes.id\`;
const blob = \`SELECT content_blob_data FROM attachment_blobs\`;
${extra}
`;
}

async function writeFixture(rootDir, source) {
  await mkdir(rootDir, { recursive: true });
  await writeFile(path.join(rootDir, 'surface.ts'), source, 'utf8');
}

describe('sql-surface-scan', () => {
  it('reports iosRuntime as a non-blocking directed gap outside iOS scope', async () => {
    await mkdir(TEMP_ROOT_BASE, { recursive: true });
    const tempRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'sql-surface-scan-'));
    try {
      await writeFixture(tempRoot, completeSqlSurface());

      const result = await runScan(tempRoot);
      const output = JSON.parse(result.stdout);

      expect(result.code).toBe(0);
      expect(output.summary.missingCoreCapabilities).toContain('iosRuntime');
      expect(output.summary.iosRuntimeGap.required).toBe(false);
      expect(output.summary.iosRuntimeGap.gate).toBe('npm run ios:sync:preflight');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails when iosRuntime markers make the iOS SQL surface in scope', async () => {
    await mkdir(TEMP_ROOT_BASE, { recursive: true });
    const tempRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'sql-surface-scan-'));
    try {
      await writeFixture(tempRoot, completeSqlSurface('const capability = "iosRuntime";'));

      const result = await runScan(tempRoot);
      const output = JSON.parse(result.stdout);

      expect(result.code).toBe(1);
      expect(output.summary.iosRuntimeGap.required).toBe(true);
      expect(output.summary.iosRuntimeGap.markers).toHaveLength(1);
      expect(result.stderr).toContain('Missing core SQL capability coverage: iosRuntime');
      expect(result.stderr).toContain('npm run ios:sync:preflight');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
