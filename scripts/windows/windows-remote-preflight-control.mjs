/* global process */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WINDOWS_DEV_EVIDENCE_PREFIX } from './windows-dev-paths.mjs';
import { prepareWindowsInternalRuntime } from './windows-internal-runtime-transfer.mjs';
import { transferWindowsNpmBundle } from './windows-npm-offline-bundle.mjs';
import { WINDOWS_DEV_DEFAULT_SSH, windowsDevScpSpec, windowsDevSshSpec, windowsDevTransportIdentity } from
  './windows-dev-remote-spec.mjs';

export const WINDOWS_REMOTE_PREFLIGHT_ACTION = 'remote-preflight';
const SHA = /^[0-9a-f]{40}$/u;
const LINE = /\[windows-dev-action\] remote-preflight identity=([A-Za-z0-9.-]{1,96}) receipt=([^\r\n]+)/u;
const PUSHED_REF = 'refs/remotes/origin/dev';

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      reject(Object.assign(new Error(output.trim().split('\n').at(-1) || `${command} exited ${code}`),
        { output }));
    });
  });
}

// Windows consumes only pushed dev, so the exact target must already be on
// the pushed branch before it is mirrored.
export function assertPushedPreflightTarget(repoRoot, target, run = spawnSync) {
  if (!SHA.test(target ?? '')) throw new Error('remote preflight target must be a full SHA');
  if (run('git', ['cat-file', '-e', `${target}^{commit}`], { cwd: repoRoot }).status !== 0) {
    throw new Error(`remote preflight target ${target} is not a local commit; fetch origin dev first`);
  }
  if (run('git', ['merge-base', '--is-ancestor', target, PUSHED_REF], { cwd: repoRoot }).status !== 0) {
    throw new Error(`remote preflight target ${target} is not on pushed origin/dev; push dev first`);
  }
  return target;
}

export function parseWindowsRemotePreflightEvidence(output) {
  const match = LINE.exec(output ?? '');
  if (!match) return null;
  const receiptPath = match[2].trim().replaceAll('\\', '/');
  if (receiptPath !== `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}/remote-preflight/receipt.json`) {
    throw new Error('Windows remote preflight receipt escaped its fixed evidence root');
  }
  return { identity: match[1], receiptPath };
}

// Shape: remote-preflight --revision <target> --preflight-base <base> [--host user@host]
export function parseWindowsRemotePreflightArgs(argv, env = process.env) {
  const result = { host: env.FOLIOLE_WINDOWS_DEV_SSH || WINDOWS_DEV_DEFAULT_SSH };
  const names = { '--host': 'host', '--preflight-base': 'base', '--revision': 'target' };
  let action = null;
  for (let index = 0; index < argv.length; index += 1) {
    const name = names[argv[index]];
    if (name) result[name] = argv[++index];
    else if (!action) action = argv[index];
    else throw new Error(`Unknown remote preflight argument: ${argv[index]}`);
  }
  if (action !== WINDOWS_REMOTE_PREFLIGHT_ACTION) throw new Error('Expected the remote-preflight action');
  if (!/^[A-Za-z0-9._\\-]+@[A-Za-z0-9.-]+$/u.test(result.host ?? '')) {
    throw new Error('Windows DEV SSH host must use user@host format');
  }
  if (!SHA.test(result.target ?? '') || !SHA.test(result.base ?? '')) {
    throw new Error('remote-preflight requires --revision <sha> and --preflight-base <sha>');
  }
  return result;
}

// PowerShell localizes the message; the error id is stable across locales.
const OUTDATED_WRAPPER = /NamedParameterNotFound|parameter name 'PreflightBase'/u;

// COMPAT(windows-remote-preflight-bootstrap): a wrapper older than this action
// rejects -PreflightBase before it pulls. A bare call pulls the current wrapper
// and then fails as an unknown build action, after which the real call binds.
async function runRemote({ base, env, executeSsh, fsApi, home, host }) {
  const spec = (args) => windowsDevSshSpec(host, WINDOWS_REMOTE_PREFLIGHT_ACTION, env, home, fsApi, args);
  const attempt = async () => {
    try {
      return { output: await executeSsh(spec(['-PreflightBase', base]), { env }) };
    } catch (error) {
      return { error, output: error.output || error.message };
    }
  };
  const first = await attempt();
  if (!first.error || !OUTDATED_WRAPPER.test(first.output)) return first;
  await executeSsh(spec([]), { env }).catch(() => {});
  return attempt();
}

export async function runWindowsRemotePreflightControl({
  base, env = process.env, executeGit = (args, options) => execute('git', args, options),
  executeScp = (args, options) => execute('scp', args, options),
  executeSsh = (args, options) => execute('ssh', args, options), fsApi = fs,
  host = env.FOLIOLE_WINDOWS_DEV_SSH || WINDOWS_DEV_DEFAULT_SSH, home = os.homedir(),
  prepareRuntime = prepareWindowsInternalRuntime, transferNpm = transferWindowsNpmBundle, pushSpec, repoRoot = process.cwd(), stdout = process.stdout, target, verifyPushed = assertPushedPreflightTarget
}) {
  if (!SHA.test(base ?? '')) throw new Error('remote preflight base must be a full SHA');
  if (!pushSpec) throw new Error('remote preflight requires the Windows DEV push spec');
  verifyPushed(repoRoot, target);
  // Windows installs dependencies offline, so the Electron archive comes from the Mac.
  await prepareRuntime({ env, executeGit, executeScp, host, repoRoot, revision: target });
  await transferNpm({ env, executeScp, fsApi, home, host, repoRoot, revision: target,
    transport: windowsDevTransportIdentity });
  const push = pushSpec(host, env, home, 'refs/heads/dev', target);
  await executeGit(push.args, { env: push.env });
  const { error: remoteError, output } = await runRemote({ base, env, executeSsh, fsApi, home, host });
  if (output) stdout.write(output);
  const evidence = parseWindowsRemotePreflightEvidence(output);
  if (!evidence) {
    const reason = remoteError?.message ?? 'no receipt was reported';
    throw new Error(`Windows remote preflight did not report a receipt: ${reason}`);
  }
  const localRoot = path.join(repoRoot, '.tmp', 'artifacts', 'remote-preflight', target, 'windows',
    evidence.identity);
  fsApi.mkdirSync(localRoot, { recursive: true });
  const remoteRoot = path.posix.dirname(evidence.receiptPath);
  for (const name of ['receipt.json', 'action.log']) {
    await executeScp(windowsDevScpSpec(host, `${remoteRoot}/${name}`, path.join(localRoot, name),
      env, home, fsApi), { env });
  }
  const receiptPath = path.join(localRoot, 'receipt.json');
  const receipt = JSON.parse(fsApi.readFileSync(receiptPath, 'utf8'));
  if (receipt.runId !== evidence.identity) {
    throw new Error('Windows remote preflight receipt does not match the reported run');
  }
  return { evidenceRoot: localRoot, receipt, receiptPath };
}
