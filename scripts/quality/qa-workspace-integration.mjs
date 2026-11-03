import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { qaGit, qaRecordPath, readQaWorkspace } from './qa-workspace-state.mjs';
import { readChainVerdict } from './chain-verdict-read.mjs';
import { readMobileResumeEvidence } from '../ios/mobile-beta-evidence-read.mjs';

export function saveQaRecord(record) {
  const saved = { ...record };
  delete saved.head;
  writeFileSync(qaRecordPath(record.devRoot), `${JSON.stringify(saved, null, 2)}\n`);
}

export function verifyQaRun(record, full = false) {
  if (!record.run?.passed || (full && !['full', 'mobile-resume'].includes(record.run.scope))) throw new Error('QA needs matching passed evidence');
  const repository = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    { cwd: record.worktreePath, encoding: 'utf8' }).trim();
  const run = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/runs/${record.run.runId}`], { encoding: 'utf8' }));
  if (run.status !== 'completed' || run.conclusion !== 'success' || run.head_branch !== record.branch
      || run.head_sha !== record.run.targetSha) throw new Error('QA evidence is no longer a matching successful run');
  if (record.run.scope === 'mobile-resume') {
    const evidence = readMobileResumeEvidence({ repository, runId: run.id, sourceSha: record.run.targetSha, cwd: record.worktreePath });
    if (evidence.qualityRunId !== record.run.qualityRunId) throw new Error('Mobile quality source differs from the owned delivery');
    return;
  }
  if (full) {
    const receipt = readChainVerdict({ repository, runId: run.id, targetSha: record.head });
    if (receipt.kind !== 'full' || receipt.verdict !== 'passed' || receipt.accepted_sha !== record.head) {
      throw new Error('QA completion requires its exact full chain receipt');
    }
  }
}

function isAncestor(cwd, before, after) {
  return spawnSync('git', ['-C', cwd, 'merge-base', '--is-ancestor', before, after]).status === 0;
}

function clean(cwd) {
  return !qaGit(cwd, 'diff', '--name-only') && !qaGit(cwd, 'diff', '--cached', '--name-only')
    && !untrackedSources(cwd);
}

function untrackedSources(cwd) {
  // Managed artifact roots may be symlinks, which directory-only Git ignores do not match.
  return qaGit(cwd, 'ls-files', '--others', '--exclude-standard', '--', '.', ':!.cache', ':!.tmp');
}

function abortOwnMerge(record, original, mergedTree) {
  if (qaGit(record.devRoot, 'rev-parse', 'HEAD') === original
      && !qaGit(record.devRoot, 'diff', '--name-only')
      && qaGit(record.devRoot, 'write-tree') === mergedTree
      && !untrackedSources(record.devRoot)) {
    qaGit(record.devRoot, 'merge', '--abort');
  }
}

export async function integrateQaWorkspace({ repoRoot, validate, verifyRun = verifyQaRun }) {
  const record = readQaWorkspace(repoRoot);
  if (record.phase !== 'prepared' || typeof validate !== 'function') throw new Error('Prepared QA and integration validation are required');
  await verifyRun(record);
  const prefix = record.run.targetSha;
  if (!isAncestor(record.worktreePath, prefix, record.head)) throw new Error('Verified prefix is not in QA history');
  if (qaGit(record.devRoot, 'branch', '--show-current') !== 'dev' || !clean(record.devRoot)) {
    throw new Error('Wait for a clean dev integration window; no files were changed');
  }
  const original = qaGit(record.devRoot, 'rev-parse', 'HEAD');
  const alreadyMerged = isAncestor(record.devRoot, prefix, original);
  if (!alreadyMerged) {
    // Detect conflicts without leaving the development checkout in a merge.
    qaGit(record.devRoot, 'merge-tree', '--write-tree', 'HEAD', prefix);
    qaGit(record.devRoot, 'merge', '--no-ff', '--no-commit', prefix);
  }
  const mergedTree = qaGit(record.devRoot, 'write-tree');
  try {
    await validate(record.devRoot);
    if (qaGit(record.devRoot, 'rev-parse', 'HEAD') !== original
        || qaGit(record.devRoot, 'write-tree') !== mergedTree
        || qaGit(record.devRoot, 'diff', '--name-only')
        || untrackedSources(record.devRoot)) {
      throw new Error('Development changed during integration; preserve the merge for recovery');
    }
    if (!alreadyMerged) {
      const sequence = execFileSync(process.execPath,
        [path.join(record.devRoot, 'scripts/git/check-commit-sequence.mjs'), 'next'],
        { cwd: record.devRoot, encoding: 'utf8' }).trim();
      qaGit(record.devRoot, 'commit', '-m', `${sequence} integrate verified QA repairs`, '-m',
        'context: QA repairs were validated independently.\nchange: merge the verified QA prefix after affected integration checks.\nintent: return repairs without importing new development into QA.');
    }
  } catch (error) {
    if (!alreadyMerged) abortOwnMerge(record, original, mergedTree);
    throw error;
  }
  record.integrated = { qaTip: prefix, devTip: qaGit(record.devRoot, 'rev-parse', 'HEAD') };
  saveQaRecord(record);
  return record.integrated;
}
