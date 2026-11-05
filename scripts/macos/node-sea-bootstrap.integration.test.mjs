// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import postject from 'postject';
import { expect, it } from 'vitest';

import { prepareNodeSeaRuntime } from './node-sea-runtime.mjs';
import { buildSeaConfig } from './prepare-foliole-cli.mjs';
import { runtimeDownloadCacheEnv } from './runtime-download-cache.mjs';

async function buildRuntime(directory) {
  const nodePath = await prepareNodeSeaRuntime(process.cwd(), {
    env: { ...process.env, ...runtimeDownloadCacheEnv(process.cwd()) },
    run: (command, args) => execFileSync(command, args)
  });
  const blob = path.join(directory, 'cli.blob');
  const config = path.join(directory, 'sea.json');
  const runtime = path.join(directory, 'foliole-runtime');
  fs.writeFileSync(config, JSON.stringify(buildSeaConfig(blob)));
  execFileSync(nodePath, ['--experimental-sea-config', config]);
  fs.copyFileSync(nodePath, runtime);
  fs.chmodSync(runtime, 0o755);
  execFileSync('codesign', ['--remove-signature', runtime]);
  await postject.inject(runtime, 'NODE_SEA_BLOB', fs.readFileSync(blob), {
    machoSegmentName: 'NODE_SEA',
    sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
  });
  execFileSync('codesign', ['--force', '--sign', '-', runtime]);
  return runtime;
}

function runVersion(runtime, agentScript) {
  return spawnSync(runtime, ['--version'], {
    encoding: 'utf8',
    env: { ...process.env, FOLIOLE_AGENT_SCRIPT: agentScript,
      FOLIOLE_PRODUCT_METADATA_PATH: path.resolve('package.json') }
  });
}

it.runIf(process.platform === 'darwin' && process.arch === 'arm64')(
  'runs the shipped CLI version through the real SEA loader and preserves sanitized missing-script errors',
  { timeout: 120000 }, async () => {
    const root = path.resolve('.tmp/artifacts/node-sea-bootstrap');
    fs.mkdirSync(root, { recursive: true });
    const directory = fs.mkdtempSync(path.join(root, 'runtime-'));
    try {
      const runtime = await buildRuntime(directory);
      const script = fs.realpathSync('scripts/agent-control/foliole-agent.mjs');
      const alias = path.join(directory, 'agent-alias.mjs');
      fs.symlinkSync(script, alias);
      for (const agentScript of [script, alias]) {
        const result = runVersion(runtime, agentScript);
        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
          agent_control_protocol_version: 1, cli_contract_version: 1, name: 'foliole',
          product_version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version
        });
      }
      const missing = runVersion(runtime, path.join(directory, 'missing.mjs'));
      expect(missing.status).toBe(3);
      expect(missing.stderr.trim()).toBe('{"error":"cli_agent_script_unavailable"}');
      expect(missing.stdout).toBe('');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
);
