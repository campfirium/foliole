/* global console, process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_SCOPES = new Set(['android', 'desktop', 'full', 'ios', 'shared']);
const FULL_SHA = /^[0-9a-f]{40}$/u;

export function parseRemoteQualityArgs(args) {
  const result = { scope: '', sha: '' };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === '--scope' || name === '--sha') {
      result[name.slice(2)] = args[index + 1] ?? '';
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${name}`);
    }
  }
  if (!ALLOWED_SCOPES.has(result.scope)) {
    throw new Error('--scope must be desktop, shared, android, ios, or full');
  }
  return result;
}

async function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const capture = options.capture !== false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: capture ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit']
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
      child.stdin.end(options.input ?? '');
    }
    child.on('error', (error) => resolve({ code: 1, stderr: error.message, stdout }));
    child.on('exit', (code) => resolve({ code: code ?? 1, stderr, stdout }));
  });
}

async function requireSuccess(runner, command, args, options = {}) {
  const result = await runner(command, args, options);
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result.stdout.trim();
}

async function dispatchWorkflow(runner, args, options) {
  const result = await runner('gh', args, options);
  if (result.code === 0) return result.stdout.trim();
  const details = (result.stderr || result.stdout).trim();
  if (/\b403\b|forbidden|resource not accessible/iu.test(details)) {
    throw new Error(`GitHub Actions write permission is required to dispatch Remote Quality: ${details}`);
  }
  throw new Error(`gh ${args.join(' ')} failed: ${details}`.trim());
}

export async function runRemoteQuality(options = {}) {
  const args = parseRemoteQualityArgs(options.args ?? process.argv.slice(2));
  const runner = options.runner ?? runProcess;
  const cwd = options.cwd ?? process.cwd();
  await requireSuccess(runner, 'gh', ['auth', 'status', '--hostname', 'github.com'], { cwd });
  const repoInfo = JSON.parse(await requireSuccess(
    runner, 'gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'], { cwd }
  ));
  const sha = args.sha || await requireSuccess(runner, 'git', ['rev-parse', 'HEAD'], { cwd });
  if (!FULL_SHA.test(sha)) throw new Error('Target SHA must be a 40-character lowercase commit SHA');
  const remoteSha = await requireSuccess(
    runner, 'gh', ['api', `repos/${repoInfo.nameWithOwner}/commits/${sha}`, '--jq', '.sha'], { cwd }
  );
  if (remoteSha !== sha) throw new Error(`Remote commit lookup did not resolve the requested SHA: ${sha}`);

  const payload = JSON.stringify({
    inputs: { scope: args.scope, target_sha: sha },
    ref: repoInfo.defaultBranchRef.name
  });
  const dispatch = JSON.parse(await dispatchWorkflow(runner, [
    'api', '--method', 'POST', '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repoInfo.nameWithOwner}/actions/workflows/remote-quality.yml/dispatches`, '--input', '-'
  ], { cwd, input: payload }));
  if (!dispatch.workflow_run_id || !dispatch.html_url) {
    throw new Error('GitHub did not return workflow_run_id and html_url for the dispatch');
  }
  console.log(`[remote-quality] ${args.scope} run: ${dispatch.html_url}`);
  const watch = await runner('gh', [
    'run', 'watch', String(dispatch.workflow_run_id), '--exit-status', '--repo', repoInfo.nameWithOwner
  ], { capture: false, cwd });
  if (watch.code !== 0) {
    await runner('gh', [
      'run', 'view', String(dispatch.workflow_run_id), '--log-failed', '--repo', repoInfo.nameWithOwner
    ], { capture: false, cwd });
    throw new Error(`Remote ${args.scope} quality failed: ${dispatch.html_url}`);
  }
  console.log(`[remote-quality] ${args.scope} quality passed for ${sha}`);
  return { runId: dispatch.workflow_run_id, scope: args.scope, sha, url: dispatch.html_url };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runRemoteQuality().catch((error) => {
    console.error(`[remote-quality] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
