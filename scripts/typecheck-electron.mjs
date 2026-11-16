import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const electronTypecheckProject = 'electron/tsconfig.json';

export function electronTypecheckArgs(env) {
  const hosted = env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted';
  const heapMiB = hosted ? 1536 : 2048;
  return [
    `--max-old-space-size=${heapMiB}`,
    'node_modules/typescript/bin/tsc', '-p', electronTypecheckProject, '--noEmit',
  ];
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const result = spawnSync(process.execPath, electronTypecheckArgs(process.env), { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
