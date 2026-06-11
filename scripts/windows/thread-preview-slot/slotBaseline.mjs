import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  ensureDir,
  gitCurrentBranch,
  gitHead,
  paths,
  run,
  toWindowsPath,
  writeState
} from './slotCommon.mjs';

function gitUpstreamRemote(repo, branch) {
  return run('git', ['config', '--get', `branch.${branch}.remote`], { cwd: repo });
}

function gitRemoteUrl(repo, remote) {
  const configured = process.env.FOLIOLE_PREVIEW_SLOT_REMOTE_URL ||
    run('git', ['config', '--get', `remote.${remote}.url`], { cwd: repo });
  if (!configured || configured === remote) {
    throw new Error(`remote ${remote} has no usable url; set remote.${remote}.url or FOLIOLE_PREVIEW_SLOT_REMOTE_URL`);
  }
  return configured;
}

function psLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function ensureBaselineExists(slot) {
  const p = paths(slot);
  if (!fs.existsSync(path.join(p.baselineDir, '.git'))) {
    throw new Error(`baseline missing: ${p.baselineDir}; run baseline-refresh first to publish and checkout the current git HEAD`);
  }
}

function publishHead(p) {
  const head = gitHead(p.repo);
  const branch = gitCurrentBranch(p.repo);
  if (!branch) {
    throw new Error('cannot publish preview HEAD from detached WSL checkout');
  }
  const remote = gitUpstreamRemote(p.repo, branch);
  const upstreamBranch = run('git', ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`], { cwd: p.repo });
  const remoteBranch = upstreamBranch.replace(`${remote}/`, '');
  const remoteUrl = gitRemoteUrl(p.repo, remote);
  run('git', ['push', remote, `HEAD:refs/heads/${remoteBranch}`], {
    cwd: p.repo,
    stdio: 'inherit'
  });
  return { branch, head, remote, remoteBranch, remoteUrl };
}

function ensureBaselineCheckout(p, publish) {
  if (!fs.existsSync(path.join(p.baselineDir, '.git'))) {
    fs.rmSync(p.baselineDir, { force: true, recursive: true });
    ensureDir(path.dirname(p.baselineDir));
    run('git', ['clone', publish.remoteUrl, p.baselineDir], { stdio: 'inherit' });
  }
  run('git', ['remote', 'set-url', 'origin', publish.remoteUrl], { cwd: p.baselineDir, stdio: 'inherit' });
  run('git', ['fetch', 'origin', `+refs/heads/${publish.remoteBranch}:refs/remotes/origin/${publish.remoteBranch}`], {
    cwd: p.baselineDir,
    stdio: 'inherit'
  });
  run('git', ['checkout', '--detach', publish.head], { cwd: p.baselineDir, stdio: 'inherit' });
  run('git', ['reset', '--hard', publish.head], { cwd: p.baselineDir, stdio: 'inherit' });
  run('git', ['clean', '-fdx'], { cwd: p.baselineDir, stdio: 'inherit' });
}

export function refreshBaseline(slot) {
  const p = paths(slot);
  const publish = publishHead(p);
  ensureBaselineCheckout(p, publish);
  const state = writeState(slot, {
    baselineBranch: publish.remoteBranch,
    baselineHead: publish.head,
    baselineRef: `${publish.remote}/${publish.remoteBranch}`,
    baselineRefreshedAt: new Date().toISOString(),
    baselineSource: 'remote-git'
  });
  console.log(`[preview-slot] baseline refreshed source=remote-git ref=${state.baselineRef} head=${state.baselineHead} path=${p.baselineDir}`);
}

export function resetSlotFromBaseline(slot) {
  const p = paths(slot);
  ensureBaselineExists(slot);
  ensureDir(p.slotDir);
  fs.rmSync(path.join(p.slotDir, '.git'), { force: true, recursive: true });
  run('rsync', [
    '-a',
    '--delete',
    '--exclude', '.git/',
    '--exclude', 'node_modules',
    '--exclude', '.tmp/',
    '--exclude', '.windows-native-*.json',
    `${p.baselineDir}/`,
    `${p.slotDir}/`
  ], { stdio: 'inherit' });
  linkDependencyDir(p.mainMirrorDir, p.slotDir, 'node_modules');
  console.log(`[preview-slot] slot reset from baseline slot=${slot} path=${p.slotDir}`);
}

function linkDependencyDir(sourceRoot, targetRoot, name) {
  const source = path.join(sourceRoot, name);
  const target = path.join(targetRoot, name);
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  console.log(`[preview-slot] linking ${name} from ${source}`);
  ensureDir(path.dirname(target));
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-WindowStyle',
    'Hidden',
    '-NonInteractive',
    '-Command',
    `New-Item -ItemType Junction -Path ${psLiteral(toWindowsPath(target))} -Target ${psLiteral(toWindowsPath(source))} | Out-Null`
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`failed to link ${name} from ${source} to ${target}`);
  }
}
