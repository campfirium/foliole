/* global console, process */

import { parseMacosA5Invocation } from './macos-a5-formal-candidate.mjs';

export async function runMacosA5Cli({ argv, errorEvidence, repoRoot, run }) {
  try {
    const invocation = parseMacosA5Invocation(argv);
    await run(invocation.action, repoRoot, { formal: invocation.formal });
  } catch (error) {
    const evidence = errorEvidence(error);
    if (evidence) process.stderr.write(evidence.endsWith('\n') ? evidence : `${evidence}\n`);
    console.error(`[macos-a5-dev] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
