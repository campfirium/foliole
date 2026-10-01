#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { validateOutputPath } from './simulator-paths.mjs';

const scenarios = ['continuous', 'merge', 'conflict', 'kinds', 'delayed-receipt',
  'trimmed', 'paged-restart', 'deletion', 'collision', 'resources', 'lost-push-response',
  'wal-snapshot', 'open-state-batch', 'resource-recovery', 'orphaned-learning-state',
  'large-dependency-page', 'unbacked-learning-state', 'escaped-dependency-page', 'tombstoned-learning-state', 'mismatched-resource-type', 'local-root-state',
  'source-edit-during-sync', 'move-between-folders', 'unchanged-replay'];
const usage = `Usage: npm run sync:simulate -- [--mode empty|real] [--scenarios all|name,...]
  [--path desktop|companion|both] [--seed 1] [--scale 1] [--out .tmp/artifacts/sync-simulator/run]
  [--database /absolute/foliole.db] [--assets /absolute/Assets]
  [--target-database /absolute/foliole.db] [--target-assets /absolute/Assets]
  --list lists scenarios. Real mode preserves source inputs using SQLite backup (WAL-aware).
  Output must be a new directory. Failed scenarios/input defects exit nonzero.`;
function parse(argv) {
  const options = { mode: 'empty', scenarios: 'all', path: 'both', seed: '1', scale: '1' };
  const names = new Set(['mode', 'scenarios', 'path', 'seed', 'scale', 'out', 'database', 'assets', 'target-database', 'target-assets']);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !names.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error(`invalid_argument:${argv[i]}`);
    }
    options[key] = argv[++i];
  }
  if (!['empty', 'real'].includes(options.mode)) throw new Error('invalid_mode');
  if (!Number.isSafeInteger(Number(options.scale)) || Number(options.scale) < 1) throw new Error('invalid_scale');
  if (options.mode === 'real' && !options.database) throw new Error('database_required');
  if (options.mode === 'empty' && (options.database || options['target-database'])) throw new Error('database_requires_real_mode');
  if (!['desktop', 'companion', 'both'].includes(options.path)) throw new Error('invalid_path');
  const selected = options.mode === 'real' ? ['real'] : options.scenarios === 'all' ? scenarios : options.scenarios.split(',');
  if (options.mode === 'empty' && selected.some((name) => !scenarios.includes(name))) throw new Error('unknown_scenario');
  const paths = options.path === 'both' ? ['desktop', 'companion'] : [options.path];
  return { options, selected: selected.flatMap((name) => paths.map((kind) => kind === 'companion' ? `${name}-companion` : name)) };
}
function main() {
  if (process.argv.includes('--help')) { process.stdout.write(usage + '\n'); return; }
  if (process.argv.includes('--list')) { process.stdout.write(scenarios.join('\n') + '\nreal\n'); return; }
  const { options, selected } = parse(process.argv.slice(2));
  const out = validateOutputPath(options.out ?? `.tmp/artifacts/sync-simulator/run-${Date.now()}`, options);
  mkdirSync(path.dirname(out), { recursive: true });
  mkdirSync(out); // Never overwrite an earlier run or any input.
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const diff = spawnSync('git', ['diff', '--binary'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).stdout;
  writeFileSync(path.join(out, 'workspace.patch'), diff);
  writeFileSync(path.join(out, 'command.json'), JSON.stringify({ argv: process.argv.slice(2), options, selected, revision }, null, 2));
  const env = { ...process.env, FOLIOLE_SIM_SCENARIOS: selected.join(','), FOLIOLE_SIM_OUTPUT: out,
    FOLIOLE_SIM_SEED: options.seed, FOLIOLE_SIM_SCALE: options.scale, FOLIOLE_SIM_REVISION: revision };
  for (const [option, variable] of Object.entries({ database: 'DATABASE', assets: 'ASSETS',
    'target-database': 'TARGET_DATABASE', 'target-assets': 'TARGET_ASSETS' })) {
    if (options[option]) env[`FOLIOLE_SIM_${variable}`] = path.resolve(options[option]);
    else delete env[`FOLIOLE_SIM_${variable}`];
  }
  const child = spawnSync(process.execPath, ['scripts/electron-sqlite-runner.mjs',
    'scripts/test-files.mjs', 'scripts/sync/simulator/simulator.http.test.mjs'], { env, stdio: 'inherit' });
  const results = selected.map((scenario) => {
    try { const { status, error } = JSON.parse(readFileSync(path.join(out, scenario, 'result.json'), 'utf8'));
      return { scenario, status, error }; }
    catch { return { scenario, status: 'failed', error: 'scenario_result_missing' }; }
  });
  const code = child.status === 0 && results.every((result) => result.status === 'passed') ? 0 : 1;
  writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ revision, results, exitCode: code }, null, 2));
  process.stdout.write(JSON.stringify({ output: out, results, exitCode: code }, null, 2) + '\n');
  process.exitCode = code;
}
try { main(); } catch (error) { process.stderr.write(`${error.message}\n${usage}\n`); process.exitCode = 2; }
