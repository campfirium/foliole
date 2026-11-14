/* global console, process */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildReleaseDesktopSourceVitestArgs, collectReleaseDesktopSourceTestFiles
} from '../run-release-desktop-source-test-bucket.mjs';
import { DEFAULT_FILE_TIMEOUT_MS, runHostedDesktopTestFile } from './hosted-desktop-test-file.mjs';

export function selectDesktopTimeout(rows, file, platform, availableFiles) {
  if (!availableFiles.includes(file)) throw new Error('File is outside desktop source coverage');
  const matches = rows.filter(row => row.file === file && row.platform === platform);
  if (matches.length !== 1 || matches[0].status !== 'timeout' ||
      !Number.isSafeInteger(matches[0].timeoutMs) || matches[0].timeoutMs <= 0) {
    throw new Error('Expected exactly one original timeout for this platform and file');
  }
  return matches[0];
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', timeout: 60_000 });
}

function downloadOriginal({ repo, runId, sha, host }) {
  if (!/^[1-9]\d*$/u.test(runId)) throw new Error('Expected a numeric source run ID');
  const run = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${runId}`]));
  if (run.path !== '.github/workflows/remote-quality.yml' || run.head_branch !== 'check' ||
      run.status !== 'completed' || run.head_sha !== sha || !Number.isSafeInteger(run.run_attempt)) {
    throw new Error('Source must be a completed Remote Quality check of this exact candidate');
  }
  const root = '.tmp/desktop-retry-source';
  gh(['run', 'download', runId, '--repo', repo, '--pattern',
    `desktop-source-${host}-*-${sha}-${run.run_attempt}`, '--dir', root]);
  const rows = readdirSync(root, { recursive: true }).filter(file => file.endsWith('.execution.json'))
    .map(file => JSON.parse(readFileSync(path.join(root, file), 'utf8')));
  return { rows, attempt: run.run_attempt };
}

export async function retryDesktopTestFile(env = process.env) {
  const { RETRY_SOURCE_RUN: runId, RETRY_FILE: file, TARGET_SHA: sha, GITHUB_REPOSITORY: repo } = env;
  const platform = process.platform;
  const host = { win32: 'Windows', linux: 'Ubuntu' }[platform];
  if (!host || env.RETRY_HOST !== host || !/^[a-f0-9]{40}$/u.test(sha)) {
    throw new Error('Expected the original platform and exact candidate');
  }
  if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== sha) {
    throw new Error('Checkout differs from the original candidate');
  }
  const { rows, attempt } = downloadOriginal({ repo, runId, sha, host });
  const original = selectDesktopTimeout(rows, file, platform, collectReleaseDesktopSourceTestFiles());
  const directory = '.tmp/desktop-file-retry';
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'source.json'), JSON.stringify({ runId, attempt, sha, original }));
  const report = path.join(directory, 'retry.json');
  return runHostedDesktopTestFile({
    args: buildReleaseDesktopSourceVitestArgs({ report, targets: [file] }),
    file, report, timeoutMs: Math.min(20 * 60_000, Math.max(DEFAULT_FILE_TIMEOUT_MS, original.timeoutMs * 2))
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  retryDesktopTestFile().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
