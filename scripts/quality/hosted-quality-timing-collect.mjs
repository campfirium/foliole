#!/usr/bin/env node
/* global console, fetch, process */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT = path.resolve('.tmp/artifacts/hosted-quality-timing/input.json');

async function githubJson(url, token) {
  const response = await fetch(`https://api.github.com${url}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${url}`);
  return response.json();
}

async function collectJobs(repository, runId, token) {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const result = await githubJson(
      `/repos/${repository}/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${page}`,
      token
    );
    jobs.push(...result.jobs);
    if (result.jobs.length < 100) return jobs;
  }
}

function selectBaseline(runs, currentId, workflowName, baselineKey) {
  return runs.find((run) => run.id !== currentId && run.conclusion === 'success' &&
    run.name === workflowName && (!baselineKey || run.display_title?.startsWith(
      `${workflowName} (${baselineKey})`
    )));
}

export async function collectHostedQualityTiming(options) {
  const current = await githubJson(
    `/repos/${options.repository}/actions/runs/${options.runId}`,
    options.token
  );
  const runs = await githubJson(
    `/repos/${options.repository}/actions/runs?branch=${encodeURIComponent(options.refName)}` +
      '&status=completed&per_page=100',
    options.token
  );
  const baseline = selectBaseline(
    runs.workflow_runs, Number(options.runId), options.workflowName, options.baselineKey
  );
  return {
    topology: options.topology,
    current: { run: current, jobs: await collectJobs(options.repository, options.runId, options.token) },
    baseline: baseline ? {
      run: baseline,
      jobs: await collectJobs(options.repository, baseline.id, options.token)
    } : null
  };
}

async function main() {
  const input = await collectHostedQualityTiming({
    baselineKey: process.env.FOLIOLE_TIMING_BASELINE_KEY ?? '',
    refName: process.env.GITHUB_REF_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    token: process.env.GH_TOKEN,
    topology: process.env.FOLIOLE_TIMING_TOPOLOGY,
    workflowName: process.env.FOLIOLE_TIMING_WORKFLOW_NAME
  });
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(input, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
