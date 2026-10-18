import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHAIN_STAGES, stagesVerdict } from './chain-verdict.mjs';

export function consumeChainVerdict({ run, artifact, receipt, targetSha }) {
  const incomplete = { verdict: 'incomplete' };
  if (!run || !artifact || !receipt || run.status !== 'completed' || artifact.expired) return incomplete;
  if (String(artifact.workflow_run?.id) !== String(run.id)
    || String(receipt.run_id) !== String(run.id)
    || receipt.run_attempt !== run.run_attempt
    || artifact.name !== `chain-verdict-${run.id}-${run.run_attempt}`
    || receipt.target_sha !== targetSha) return incomplete;
  if (run.conclusion === 'cancelled' || run.conclusion === 'timed_out') return incomplete;
  if (!['success', 'failure'].includes(run.conclusion)) return incomplete;
  if (!['full', 'replay'].includes(receipt.kind)) return incomplete;
  const stages = Object.keys(receipt.stages ?? {});
  if (!stages.length || stages.some(stage => !CHAIN_STAGES.includes(stage))) return incomplete;
  if (receipt.kind === 'full' && CHAIN_STAGES.some(stage => !stages.includes(stage))) return incomplete;
  const needs = Object.fromEntries(stages.map(stage => [stage, {
    result: receipt.stages[stage], outputs: { accepted_sha: receipt.stage_shas?.[stage] }
  }]));
  const verdict = stagesVerdict(stages, needs, targetSha);
  if (verdict !== receipt.verdict) return incomplete;
  if (verdict === 'passed' && run.conclusion !== 'success') return incomplete;
  if (verdict === 'passed' && receipt.kind === 'full' && receipt.accepted_sha !== targetSha) return incomplete;
  const trusted = { ...receipt };
  delete trusted.accepted_sha;
  if (verdict === 'passed' && receipt.kind === 'full' && receipt.accepted_sha === targetSha) {
    return { ...trusted, accepted_sha: targetSha };
  }
  return trusted;
}

function ghApi(endpoint, binary = false) {
  return execFileSync('gh', ['api', endpoint], {
    encoding: binary ? undefined : 'utf8', maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function readReceipt(archive) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'chain-verdict-'));
  try {
    const file = path.join(directory, 'receipt.zip');
    writeFileSync(file, archive);
    const json = execFileSync('unzip', ['-p', file, 'chain-verdict.json'], {
      encoding: 'utf8', maxBuffer: 1024 * 1024
    });
    return JSON.parse(json);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function readChainVerdict({ repository, runId, targetSha, api = ghApi, decode = readReceipt }) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository) || !/^\d+$/u.test(String(runId))) {
    throw new Error('An explicit repository and run ID are required');
  }
  const base = `repos/${repository}/actions`;
  const readRun = () => JSON.parse(api(`${base}/runs/${runId}`));
  const run = readRun();
  if (run.status !== 'completed') return { verdict: 'incomplete' };
  const name = `chain-verdict-${run.id}-${run.run_attempt}`;
  const { artifacts } = JSON.parse(api(`${base}/runs/${runId}/artifacts?name=${name}&per_page=100`));
  const matches = artifacts.filter(artifact => artifact.name === name && !artifact.expired);
  if (matches.length !== 1) return { verdict: 'incomplete' };
  const artifact = matches[0];
  const receipt = decode(api(`${base}/artifacts/${artifact.id}/zip`, true));
  // A rerun may have started while the artifact was being downloaded.
  return consumeChainVerdict({ run: readRun(), artifact, receipt, targetSha });
}
