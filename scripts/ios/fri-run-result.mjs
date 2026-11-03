/* global console, process */
import { existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describeFriFailure } from './fri-xctest-diagnosis.mjs';
import { consumeFriHandoff } from './fri-run-handoff.mjs';

export function assertFriRunSucceeded(result, label = 'Fri XCTest', options = {}) {
  const handoff = consumeFriHandoff(result, options);
  if ((result.code ?? result.status) === 0) return;
  const failure = describeFriFailure(result, label);
  throw Object.assign(new Error(failure.message), failure, {
    handoff,
    code: result.code ?? result.status ?? 1,
    cause: result.error
  });
}

function consumeSavedResult(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!['--state', '--log', '--code', '--feedback', '--result'].includes(flag) ||
        argv[index + 1] === undefined || args[flag] !== undefined) {
      throw new Error(`Invalid or repeated option: ${flag}`);
    }
    args[flag] = argv[index + 1];
  }
  if (!args['--state']) throw new Error('--state is required for the same recovery episode');
  const statePath = path.resolve(args['--state']);
  const root = path.resolve('.tmp/artifacts') + path.sep;
  if (!statePath.startsWith(root)) throw new Error('--state must be in this checkout .tmp/artifacts');
  if (args['--result'] && (args['--log'] || args['--code'])) {
    throw new Error('Use --result or --log with --code');
  }
  const result = readResult(args);
  const recovery = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery)) {
    throw new Error('Invalid recovery record');
  }
  const feedback = args['--feedback'] ? JSON.parse(args['--feedback']) : undefined;
  const handoff = consumeFriHandoff(result, { recovery, feedback });
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(`${statePath}.next`, `${JSON.stringify(recovery, null, 2)}\n`);
  renameSync(`${statePath}.next`, statePath);
  console.log(JSON.stringify({ statePath, handoff }));
}

function readResult(args) {
  if (args['--result']) return JSON.parse(readFileSync(args['--result'], 'utf8'));
  if (args['--log']) {
    if (!/^\d+$/u.test(args['--code'] ?? '')) throw new Error('--log requires the actual --code');
    return { output: readFileSync(args['--log'], 'utf8'), code: Number(args['--code']) };
  }
  if (args['--code']) throw new Error('--code requires --log');
  if (!args['--feedback']) throw new Error('A result or feedback is required');
  return {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { consumeSavedResult(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
