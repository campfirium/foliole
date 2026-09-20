// @vitest-environment node
/* global process */

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { expect, it } from 'vitest';

import { openMacosA5BuildCapsule, closeMacosA5BuildCapsule } from './macos-a5-build-capsule.mjs';
import { createMacosA5ExecutionContext } from './macos-a5-execution-context.mjs';

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function makeArchive(root, version) {
  const directory = path.join(root, `archive-${version}`);
  fs.mkdirSync(path.join(directory, 'package'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package/package.json'), JSON.stringify({
    name: 'capsule-cache-fixture', version,
    scripts: { install: 'node -e "require(\'fs\').writeFileSync(\'installed.txt\', \'yes\')"' }
  }));
  const archive = path.join(root, `${version}.tgz`);
  execFileSync('tar', ['-czf', archive, '-C', directory, 'package']);
  return createHash('sha512').update(fs.readFileSync(archive)).digest('base64');
}

async function serveArchives(root) {
  const worker = new Worker(`
    const { workerData, parentPort } = require('node:worker_threads');
    const fs = require('node:fs');
    const path = require('node:path');
    require('node:http').createServer((request, response) => {
      fs.appendFileSync(path.join(workerData, 'requests.txt'), request.url + '\\n');
      const archive = path.join(workerData, path.basename(request.url));
      if (!fs.existsSync(archive)) { response.writeHead(404); response.end(); return; }
      response.setHeader('cache-control', 'public, max-age=31536000, immutable');
      response.end(fs.readFileSync(archive));
    }).listen(0, '127.0.0.1', function () { parentPort.postMessage(this.address().port); });
  `, { eval: true, workerData: root });
  const port = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  return { worker, url: `http://127.0.0.1:${port}` };
}

function commitLock(repo, url, version, integrity) {
  const dependency = `${url}/${version}.tgz`;
  const manifest = { name: 'capsule-fixture', version: '1.0.0',
    dependencies: { 'capsule-cache-fixture': dependency } };
  const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3,
    packages: { '': manifest, 'node_modules/capsule-cache-fixture': {
      version, resolved: dependency, integrity: `sha512-${integrity}`, hasInstallScript: true
    } } };
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(repo, 'package-lock.json'), JSON.stringify(lock));
  git(repo, ['add', 'package.json', 'package-lock.json', '.npmrc']);
  git(repo, ['commit', '-m', `Lock ${version}`]);
  return git(repo, ['rev-parse', 'HEAD']);
}

function install(repo, revision, offline = false) {
  const context = createMacosA5ExecutionContext({ repoRoot: repo, action: 'build',
    acceptedRevision: revision, formalSourceClass: 'frozen-build' });
  return openMacosA5BuildCapsule(context, { run(command, args, options) {
    const effectiveArgs = command === 'npm'
      ? [...args, '--fetch-retries=0', ...(offline ? ['--offline'] : [])] : args;
    execFileSync(command, effectiveArgs, { ...options, encoding: 'utf8', stdio: 'pipe',
      timeout: 15000, env: { ...process.env, npm_config_update_notifier: 'false' } });
  } });
}

function assertInstalled(capsule, version) {
  const packageRoot = path.join(capsule.buildRoot, 'node_modules/capsule-cache-fixture');
  expect(JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'))).version).toBe(version);
  expect(fs.readFileSync(path.join(packageRoot, 'installed.txt'), 'utf8')).toBe('yes');
  expect(fs.existsSync(path.join(capsule.buildRoot, '.tmp/npm-cache'))).toBe(false);
}

function corruptArchive(cache, integrity) {
  const hex = Buffer.from(integrity, 'base64').toString('hex');
  const content = path.join(cache, '_cacache/content-v2/sha512',
    hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
  fs.writeFileSync(content, 'corrupt archive');
}

function verifyReuse(repo, revision, requests) {
  const cold = install(repo, revision);
  assertInstalled(cold, '1.0.0');
  expect(requests()).toEqual(['/1.0.0.tgz']);
  const lock = fs.readFileSync(path.join(cold.buildRoot, 'package-lock.json'), 'utf8');
  closeMacosA5BuildCapsule(cold);
  expect(fs.existsSync(cold.capsuleRoot)).toBe(false);
  const warm = install(repo, revision, true);
  assertInstalled(warm, '1.0.0');
  expect(warm.buildRoot).not.toBe(cold.buildRoot);
  expect(fs.readFileSync(path.join(warm.buildRoot, 'package-lock.json'), 'utf8')).toBe(lock);
  expect(requests()).toEqual(['/1.0.0.tgz']);
  closeMacosA5BuildCapsule(warm);
}

function verifyRecovery(repo, revision, cache, integrity, requests) {
  corruptArchive(cache, integrity);
  const recovered = install(repo, revision);
  assertInstalled(recovered, '2.0.0');
  expect(requests()).toEqual(['/1.0.0.tgz', '/2.0.0.tgz', '/2.0.0.tgz']);
  closeMacosA5BuildCapsule(recovered);
  corruptArchive(cache, integrity);
  expect(() => install(repo, revision, true)).toThrow();
  expect(fs.readdirSync(path.join(repo, '.lab/internal/macos-a5-controller/capsules'))).toEqual([]);
  expect(fs.existsSync(cache)).toBe(true);
  const evidence = path.join(repo, '.tmp/artifacts/macos-a5-formal');
  const failure = fs.readdirSync(evidence).map((runId) => JSON.parse(
    fs.readFileSync(path.join(evidence, runId, 'capsule-failure.json'), 'utf8')
  ));
  expect(failure).toEqual([expect.objectContaining({ stage: 'dependencies', resultStatus: 'failed' })]);
}

it('reuses verified downloads across frozen capsules and repairs corrupt cache without sharing installs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-npm-cache-'));
  let server;
  try {
    const integrity1 = makeArchive(root, '1.0.0');
    const integrity2 = makeArchive(root, '2.0.0');
    server = await serveArchives(root);
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    git(repo, ['init', '-b', 'dev']);
    git(repo, ['config', 'user.email', 'cache@example.invalid']);
    git(repo, ['config', 'user.name', 'Cache Test']);
    fs.writeFileSync(path.join(repo, '.npmrc'), 'cache=.tmp/npm-cache\naudit=false\nfund=false\n');
    const cache = path.join(repo, '.cache/npm-downloads');
    const requests = () => fs.readFileSync(path.join(root, 'requests.txt'), 'utf8').trim().split('\n');
    const revision1 = commitLock(repo, server.url, '1.0.0', integrity1);
    verifyReuse(repo, revision1, requests);
    expect(fs.existsSync(cache)).toBe(true);
    const revision2 = commitLock(repo, server.url, '2.0.0', integrity2);
    const changed = install(repo, revision2);
    assertInstalled(changed, '2.0.0');
    closeMacosA5BuildCapsule(changed);
    expect(requests()).toEqual(['/1.0.0.tgz', '/2.0.0.tgz']);
    verifyRecovery(repo, revision2, cache, integrity2, requests);
    expect(fs.existsSync(path.join(repo, 'node_modules'))).toBe(false);
  } finally {
    await server?.worker.terminate();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60000);
