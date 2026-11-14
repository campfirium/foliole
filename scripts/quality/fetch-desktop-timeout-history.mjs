/* global console, process */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const { GITHUB_REPOSITORY, GITHUB_RUN_ID, RUNNER_OS, DESKTOP_HISTORY_BUCKET } = process.env;
const root = path.resolve('.tmp/desktop-timeout-history');
mkdirSync(root, { recursive: true });
try {
  const output = execFileSync('gh', ['run', 'list', '--repo', GITHUB_REPOSITORY, '--workflow',
    'remote-quality.yml', '--branch', 'check', '--status', 'completed', '--limit', '20',
    '--json', 'databaseId,displayTitle'], { encoding: 'utf8', timeout: 20_000 });
  const host = RUNNER_OS === 'Windows' ? 'Windows' : 'Ubuntu';
  for (const { databaseId, displayTitle } of JSON.parse(output)) {
    if (!Number.isSafeInteger(databaseId) || String(databaseId) === GITHUB_RUN_ID) continue;
    const directory = path.join(root, String(databaseId));
    const pattern = displayTitle.startsWith('Dev Quality Check (desktop-file-retry)')
      ? `desktop-retry-${host}-*` : `desktop-source-${host}-${DESKTOP_HISTORY_BUCKET}-*`;
    try {
      execFileSync('gh', ['run', 'download', String(databaseId), '--repo', GITHUB_REPOSITORY,
        '--pattern', pattern, '--dir', directory],
      { timeout: 15_000, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch {
      console.warn(`[desktop-source] timing artifact unavailable for run ${databaseId}`);
    }
  }
} catch {
  console.warn('[desktop-source] timing history unavailable; using the default timeout');
}
