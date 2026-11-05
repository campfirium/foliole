/* global process, Buffer */
// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'yaml';
import { registrationFixture } from './mobile-candidate-test-fixtures.mjs';
import { readPlayRegistration } from './mobile-candidate-read.mjs';
import { registerMobileCandidate } from './mobile-candidate-store.mjs';
import { requireTrustedMobileRegistrar } from './mobile-candidate-register.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function archives() {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/mobile-registration-test-')); roots.push(root);
  const f = registrationFixture(); const aab = Buffer.from('original signed-byte boundary');
  f.candidate.aabSha256 = createHash('sha256').update(aab).digest('hex');
  const zipped = (name, members) => {
    const folder = path.join(root, name); fs.mkdirSync(folder);
    for (const [member, bytes] of Object.entries(members)) fs.writeFileSync(path.join(folder, member), bytes);
    const target = path.join(root, `${name}.zip`);
    execFileSync('zip', ['-j', target, ...Object.keys(members).map(member => path.join(folder, member))]);
    return fs.readFileSync(target);
  };
  const zip = new Map([[10, zipped('signed', { 'candidate.json': JSON.stringify(f.candidate), 'app-release-signed.aab': aab })],
    [11, zipped('quality', { 'chain-verdict.json': JSON.stringify(f.quality) })]]);
  for (const artifact of [f.signedArtifact, f.qualityArtifact]) {
    artifact.digest = `sha256:${createHash('sha256').update(zip.get(artifact.id)).digest('hex')}`;
  }
  const rows = []; const calls = [];
  const api = async (method, route, body) => {
    calls.push({ method, route, body });
    if (route === 'actions/runs/42') return f.run;
    if (route.startsWith('actions/runs/42/artifacts?')) return { total_count: 2, artifacts: [f.signedArtifact, f.qualityArtifact] };
    if (route.startsWith('actions/runs/42/attempts/1/jobs?')) return { total_count: f.jobs.length, jobs: f.jobs };
    if (route.startsWith('actions/artifacts/')) return zip.get(Number(route.split('/')[2]));
    if (route.startsWith('contents/package.json?')) return { encoding: 'base64', content: Buffer.from(JSON.stringify({ version: f.candidate.version })).toString('base64') };
    if (route.startsWith('deployments?')) return rows;
    if (method === 'POST' && route === 'deployments') {
      const row = { id: 71, sha: body.ref, task: body.task, environment: body.environment,
        creator: { login: 'github-actions[bot]' }, payload: body.payload }; rows.push(row); return row;
    }
    throw new Error(`Unexpected boundary ${method} ${route}`);
  };
  return { ...f, api, zip, calls, rows };
}

it('reads actual checkpoint ZIP bytes, verifies provenance and preserves one candidate across independent registration calls', async () => {
  const f = archives(); const source = { runId: '42', artifactName: f.signedArtifact.name };
  const first = await registerMobileCandidate(f.api, await readPlayRegistration(f.api, source));
  expect(first.payload.candidate.aabSha256).toBe(f.candidate.aabSha256);
  const recovered = await registerMobileCandidate(f.api, await readPlayRegistration(f.api, source));
  expect(recovered.id).toBe(first.id);
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(1);
  expect(f.calls.some(call => call.route.includes('/attempts/1/jobs'))).toBe(true);
});

it('refuses corrupted archives, expired checkpoints and changed source quality without durable writes', async () => {
  for (const corrupt of [f => { f.zip.set(10, Buffer.from('corrupted transport')); },
    f => { f.signedArtifact.expired = true; }, f => { f.qualityArtifact.expired = true; },
    f => { f.jobs[0].conclusion = 'failure'; }, f => { f.run.head_repository.full_name = 'other/repo'; }]) {
    const f = archives(); corrupt(f);
    await expect(readPlayRegistration(f.api, { runId: '42', artifactName: f.signedArtifact.name })).rejects.toThrow();
    expect(f.rows).toEqual([]);
  }
});

it('requires default-branch code for reusable and manual entries and rejects ordinary local invocation before network use', async () => {
  const env = { GITHUB_REPOSITORY: 'campfirium/foliole' }; const headSha = 'a'.repeat(40);
  const api = async (method, route) => route === '' ? { default_branch: 'dev' } : { sha: headSha };
  await expect(requireTrustedMobileRegistrar({ api, env, headSha })).resolves.toBeUndefined();
  await expect(requireTrustedMobileRegistrar({ api, env, headSha: 'b'.repeat(40) })).rejects.toThrow(/trusted default/u);
  await expect(requireTrustedMobileRegistrar({ api, env: { GITHUB_REPOSITORY: 'other/repo' }, headSha })).rejects.toThrow(/repository/u);
  const local = spawnSync(process.execPath, ['scripts/mobile/mobile-candidate-register.mjs'], {
    env: { ...process.env, GITHUB_ACTIONS: '', RUNNER_ENVIRONMENT: '' }, encoding: 'utf8' });
  expect(local.status).not.toBe(0);
  expect(local.stderr).toContain('hosted');
  const workflow = parse(fs.readFileSync('.github/workflows/mobile-candidate-register.yml', 'utf8'));
  expect(workflow.on.workflow_dispatch).toBeDefined();
  expect(workflow.jobs.register.steps[0].with).toEqual({ ref: 'dev', 'persist-credentials': false });
  expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read', deployments: 'write' });
});
