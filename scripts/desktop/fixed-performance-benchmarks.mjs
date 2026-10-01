import process from 'node:process';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseBenchmarkOptions } from './fixed-performance-summary.mjs';
import { createNativeHiddenDesktopBuildCommands, runNativeHiddenDesktopGate } from './playwright-desktop-native-hidden.mjs';
import { normalizeSpawnCommand } from '../lib/spawn-command.mjs';
import { createBenchmarkReport } from './fixed-performance-report.mjs';

async function fingerprint(root) {
  const hash = createHash('sha256');
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) { hash.update(path.relative(root, file)); hash.update(await readFile(file)); }
    }
  }
  await visit(root);
  return hash.digest('hex');
}

function run(command) {
  const normalized = normalizeSpawnCommand([command.bin, ...command.args]);
  const child = spawn(normalized.bin, normalized.args, {
    cwd: command.cwd, env: command.env, stdio: 'inherit'
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

const options = parseBenchmarkOptions(process.argv.slice(2));
const output = path.resolve('.tmp/artifacts', `t285-${options.mode}-${Date.now()}`);
await mkdir(output, { recursive: true });
const git = (args) => execFileSync('git', args, { encoding: 'utf8' });
const manifest = { options, capturedAt: new Date().toISOString(), head: git(['rev-parse', 'HEAD']),
  status: git(['status', '--short']), trackedDiffSha256: createHash('sha256').update(git(['diff', 'HEAD'])).digest('hex'),
  machine: { platform: process.platform, arch: process.arch, cpus: os.cpus().length,
    model: os.cpus()[0]?.model, totalMemory: os.totalmem(), node: process.version },
  exitCode: null, httpExitCode: null, preflightExitCode: null, desktopExitCode: null,
  buildBefore: null, buildAfter: null, failure: null };
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
try {
  manifest.httpExitCode = await run({ bin: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'test:sqlite:electron', '--', 'scripts/desktop/fixed-performance-http.test.mjs'],
    cwd: process.cwd(), env: { ...process.env, FOLIOLE_BENCHMARK_MODE: options.mode,
      FOLIOLE_BENCHMARK_OUTPUT: path.join(output, 'http') } });
  if (manifest.httpExitCode) throw new Error('HTTP benchmark failed; native scenarios were not started');
  manifest.preflightExitCode = await run({ bin: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'quality:fast'], cwd: process.cwd(), env: process.env });
  if (manifest.preflightExitCode) throw new Error('quality:fast failed; native scenarios were not started');
  for (const command of createNativeHiddenDesktopBuildCommands()) {
    const code = await run(command);
    if (code) throw new Error(`Benchmark build failed with exit ${code}`);
  }
  manifest.buildBefore = await fingerprint(path.resolve('dist'));
  manifest.desktopExitCode = await runNativeHiddenDesktopGate({
    argv: ['tests/desktop/fixed-performance-benchmarks.spec.ts',
      'tests/desktop/sync-pack-load-responsiveness.spec.ts', '--output', path.join(output, 'results')],
    env: { ...process.env, FOLIOLE_BENCHMARK_MODE: options.mode, FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1' }
  });
  manifest.buildAfter = await fingerprint(path.resolve('dist'));
  manifest.exitCode = manifest.httpExitCode || manifest.desktopExitCode;
  if (manifest.buildBefore !== manifest.buildAfter) throw new Error('Build changed during measurement; comparison invalid');
} catch (error) {
  manifest.exitCode = 1;
  manifest.failure = String(error);
} finally {
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(await createBenchmarkReport(output), null, 2));
}
console.log(`Fixed benchmark evidence: ${output}`);
process.exitCode = manifest.exitCode;
