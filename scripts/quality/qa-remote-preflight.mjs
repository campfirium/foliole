/* global process */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildRelatedTestSteps } from './quality-fast-related-tests.mjs';
import { runRemoteQualityPreflight } from './remote-quality-preflight.mjs';
import { runQaWorkspaceCommand } from './qa-workspace.mjs';

export async function runQaPreflight({ cwd, base, head, scope }) {
  return runRemoteQualityPreflight({ cwd, base, head, scope, runTests: async files => {
    for (const step of buildRelatedTestSteps(files)) {
      const code = await runQaWorkspaceCommand({ repoRoot: cwd, command: [process.execPath, ...step.args] });
      if (code !== 0) throw new Error(`${step.label} failed`);
    }
  } });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [base, head, scope] = process.argv.slice(2);
  await runQaPreflight({ cwd: process.cwd(), base, head, scope });
}
