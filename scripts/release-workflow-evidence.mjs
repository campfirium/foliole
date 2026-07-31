#!/usr/bin/env node
/* global console, process */

import { basename } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const FULL_SHA = /^[0-9a-f]{40}$/u;
const RUN_ID = /^[1-9]\d*$/u;
const WORKFLOW_ID = /^(?:[1-9]\d*|\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml)$/u;

function required(value, name) {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function parseIdentity(value) {
  const workflow = required(value, 'workflow');
  if (!WORKFLOW_ID.test(workflow)) {
    throw new Error('workflow must be a numeric ID or .github/workflows/<file>.yml path.');
  }
  return {
    endpointId: workflow.startsWith('.') ? basename(workflow) : workflow,
    workflow
  };
}

function workflowMatches(run, workflow) {
  if (RUN_ID.test(workflow)) return String(run.workflow_id) === workflow;
  return String(run.path ?? '').split('@', 1)[0] === workflow;
}

function createEvidenceUrl({ apiUrl, endpointId, repository, runId, sha }) {
  const suffix = runId
    ? `actions/runs/${runId}`
    : `actions/workflows/${encodeURIComponent(endpointId)}/runs`;
  const url = new URL(`repos/${repository}/${suffix}`, `${apiUrl.replace(/\/$/u, '')}/`);
  if (!runId) {
    url.searchParams.set('head_sha', sha);
    url.searchParams.set('status', 'completed');
    url.searchParams.set('per_page', '100');
  }
  return url;
}

async function requestEvidence(url, token, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!response.ok) throw new Error(`GitHub Actions evidence query failed with HTTP ${response.status}.`);
  return response.json();
}

function validateRuns(runs, { sha, workflow }) {
  if (runs.length === 0) throw new Error(`No workflow evidence exists for ${workflow} at ${sha}.`);
  for (const run of runs) {
    if (!workflowMatches(run, workflow)) throw new Error('Workflow evidence identity does not match the requested workflow.');
    if (run.head_sha !== sha) throw new Error('Workflow evidence SHA does not match the requested SHA.');
  }
  const success = runs.find((run) => run.status === 'completed' && run.conclusion === 'success');
  if (!success) throw new Error(`No completed successful workflow evidence exists for ${workflow} at ${sha}.`);
  return success;
}

export async function verifyWorkflowEvidence({
  apiUrl = 'https://api.github.com',
  fetchImpl = globalThis.fetch,
  repository,
  runId,
  sha,
  token,
  workflow
}) {
  const normalizedRepository = required(repository, 'repository');
  const normalizedSha = required(sha, 'target_sha');
  const normalizedToken = required(token, 'GitHub token');
  const identity = parseIdentity(workflow);
  if (!/^[^/\s]+\/[^/\s]+$/u.test(normalizedRepository)) throw new Error('repository must use owner/name format.');
  if (!FULL_SHA.test(normalizedSha)) throw new Error('target_sha must be a lowercase 40-character commit SHA.');
  if (runId && !RUN_ID.test(runId)) throw new Error('run_id must be a positive integer.');
  const url = createEvidenceUrl({ apiUrl, endpointId: identity.endpointId, repository: normalizedRepository, runId, sha: normalizedSha });
  const payload = await requestEvidence(url, normalizedToken, fetchImpl);
  const runs = runId ? [payload] : payload.workflow_runs;
  if (!Array.isArray(runs)) throw new Error('GitHub Actions evidence response is malformed.');
  const evidence = validateRuns(runs, { sha: normalizedSha, workflow: identity.workflow });
  return { runId: evidence.id, sha: evidence.head_sha, url: evidence.html_url, workflow: identity.workflow };
}

async function main() {
  const evidence = await verifyWorkflowEvidence({
    apiUrl: process.env.GITHUB_API_URL,
    repository: process.env.FOLIOLE_EVIDENCE_REPOSITORY,
    runId: process.env.FOLIOLE_EVIDENCE_RUN_ID?.trim(),
    sha: process.env.FOLIOLE_EVIDENCE_TARGET_SHA,
    token: process.env.GITHUB_TOKEN,
    workflow: process.env.FOLIOLE_EVIDENCE_WORKFLOW
  });
  console.log(`workflow=${evidence.workflow}`);
  console.log(`target_sha=${evidence.sha}`);
  console.log(`evidence_run_id=${evidence.runId}`);
  console.log(`evidence_url=${evidence.url}`);
}

if (basename(process.argv[1] ?? '') === basename(fileURLToPath(import.meta.url))) {
  await main();
}
