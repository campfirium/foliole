/* global AbortController */

import {
  createReadinessProvenance, createReadinessReceipt, READINESS_STAGE_NAMES
} from './journey-readiness-contract.mjs';

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function blockedFact(owner, reason, status = 'blocked') {
  return { action: null, missingFacts: [reason], owner, status };
}

async function runProvider(owner, provider, options) {
  if (options.signal?.aborted && !options.ignoreAbort) return blockedFact(owner, 'qualification cancelled');
  if (typeof provider !== 'function') return blockedFact(owner, 'adapter missing');
  let timer;
  const stageController = new AbortController();
  const cancel = new Promise((_, reject) => {
    options.signal?.addEventListener('abort', () => {
      stageController.abort();
      reject(new Error('qualification cancelled'));
    }, { once: true });
  });
  try {
    const timeout = new Promise((_, reject) => {
      timer = globalThis.setTimeout(() => {
        stageController.abort();
        reject(new Error('qualification timed out'));
      }, options.timeoutMs);
    });
    const competitors = [provider({ signal: stageController.signal }), timeout];
    if (!options.ignoreAbort) competitors.push(cancel);
    const fact = await Promise.race(competitors);
    if (!['passed', 'blocked', 'invalidated'].includes(fact?.status)) {
      return blockedFact(owner, 'provider returned an unknown status');
    }
    return { action: fact.action ?? null, missingFacts: fact.missingFacts ?? [], owner, status: fact.status };
  } catch (error) {
    return blockedFact(owner, errorMessage(error));
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function replaceEvidenceFailure(receipt, reason, completedAt) {
  const facts = receipt.facts.map((fact) => fact.owner === 'evidence'
    ? blockedFact('evidence', reason)
    : fact);
  return createReadinessReceipt({
    completedAt,
    facts,
    locator: null,
    provenance: receipt.provenance,
    startedAt: receipt.startedAt
  });
}

export async function runJourneyQualification({
  definition,
  locator,
  now = () => new Date().toISOString(),
  providers,
  signal,
  timeoutMs = 30_000,
  writeReceipt
}) {
  const startedAt = now();
  const provenance = createReadinessProvenance(definition);
  const facts = [];
  for (const owner of READINESS_STAGE_NAMES) {
    facts.push(await runProvider(owner, providers?.[owner], {
      ignoreAbort: owner === 'cleanup', signal, timeoutMs
    }));
  }
  const receipt = createReadinessReceipt({ completedAt: now(), facts, locator,
    provenance, startedAt });
  try {
    await writeReceipt(receipt);
    return receipt;
  } catch (error) {
    return replaceEvidenceFailure(receipt, `receipt archive failed: ${errorMessage(error)}`, now());
  }
}
