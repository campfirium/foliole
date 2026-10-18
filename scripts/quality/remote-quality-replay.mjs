import { CHAIN_STAGES } from './chain-verdict.mjs';
import { readChainVerdict } from './chain-verdict-read.mjs';

export function selectReplayStages(receipt) {
  if (!receipt?.stages) throw new Error('No usable chain-verdict; run --scope full');
  if (receipt.verdict === 'passed') throw new Error('The chain passed; no stages to replay');
  const stages = Object.entries(receipt.stages)
    .filter(([, result]) => result === 'failure' || result === 'cancelled')
    .map(([stage]) => stage);
  if (stages.some(stage => !CHAIN_STAGES.includes(stage))) {
    throw new Error('Unknown replay stage in chain-verdict; run --scope full');
  }
  if (!stages.length) throw new Error('No failed or cancelled stages to replay; run --scope full');
  return stages;
}

export async function resolveReplayStages({ repository, runId, readRun, read = readChainVerdict }) {
  const run = await readRun(runId);
  if (!/^[0-9a-f]{40}$/u.test(run.head_sha ?? '')) {
    throw new Error('Replay source run has no exact target SHA; run --scope full');
  }
  const receipt = await read({ repository, runId, targetSha: run.head_sha });
  return selectReplayStages(receipt).join(',');
}

export function assertNoActiveFullReplay(runs, targetSha) {
  const active = runs.find(run => run.head_sha === targetSha && (
    run.path === '.github/workflows/t7-hosted-quality.yml'
    || /^Remote Quality \(full\) @ /u.test(run.display_title ?? '')
  ));
  if (active) throw new Error(`A full chain for ${targetSha} is still active: ${active.html_url ?? active.id}`);
}
