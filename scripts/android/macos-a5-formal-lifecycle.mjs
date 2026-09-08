/* global console, process */

import path from 'node:path';

import { beginFormalA5Candidate } from './macos-a5-formal-candidate.mjs';
import {
  closeMacosA5Run, createMacosA5ExecutionContext, openMacosA5Run
} from './macos-a5-execution-context.mjs';
import {
  formalEvidenceRetentionTaskId, replaceSupersededFormalEvidence,
  writeFormalEvidenceRetentionOwner
} from './macos-a5-evidence-replacement.mjs';
import {
  completeFormalA5Receipt, failFormalA5Receipt, formalA5AcceptedTipLine, openFormalA5Receipt
} from './macos-a5-formal-receipt.mjs';
import {
  maintainBeforeProduction, prepareCacheEntry
} from '../diagnostics/local-artifact-cache-production.mjs';

function reportRetentionFailures(result) {
  for (const failure of result?.failures ?? []) {
    console.error(`[macos-a5-dev] evidence-retention failed run=${failure.runId}: ${failure.message}`);
  }
}

function runEvidenceReplacement(options) {
  try { reportRetentionFailures(replaceSupersededFormalEvidence(options)); }
  catch (error) {
    console.error(`[macos-a5-dev] evidence-retention failed: ${error.message}`);
  }
}

export function openMacosA5Lifecycle({ action, actionContract, formal, repoRoot }) {
  const taskId = formalEvidenceRetentionTaskId(actionContract, { formal });
  const sharedCacheRoot = path.join(path.resolve(repoRoot), '.cache');
  if (actionContract.requiresHiddenDesktopRuntime) {
    prepareCacheEntry({ entryName: 'native-hidden-electron', rootDir: repoRoot });
  } else {
    maintainBeforeProduction({ rootDir: repoRoot });
  }
  const candidate = formal && actionContract.formalSourceClass === 'frozen-build'
    ? beginFormalA5Candidate(repoRoot) : null;
  const context = createMacosA5ExecutionContext({
    acceptedRevision: candidate?.revision, acceptedTree: candidate?.tree, action,
    formalSourceClass: formal ? actionContract.formalSourceClass : null, repoRoot,
    requiresHiddenDesktopRuntime: formal && actionContract.requiresHiddenDesktopRuntime
  });
  openMacosA5Run(context);
  let receipt;
  try {
    receipt = formal ? openFormalA5Receipt(context, actionContract) : null;
    if (receipt && taskId) {
      writeFormalEvidenceRetentionOwner(receipt, taskId);
      runEvidenceReplacement({ actionContract, context, taskId });
    }
  } catch (error) {
    closeMacosA5Run(context);
    throw error;
  }
  return { context, receipt, sharedCacheRoot, taskId };
}

export function finishMacosA5Lifecycle({
  actionContract, context, failedStage, failure, receipt, taskId
}) {
  if (failure) {
    if (receipt) failFormalA5Receipt(receipt, failure, failedStage);
  } else if (receipt) {
    completeFormalA5Receipt(receipt);
  }
  if (receipt && taskId) runEvidenceReplacement({
    actionContract, context, currentRunId: context.runId, taskId
  });
  if (failure) throw failure;
  const acceptedTip = receipt ? formalA5AcceptedTipLine(receipt.receipt) : null;
  if (acceptedTip) process.stdout.write(acceptedTip);
}
