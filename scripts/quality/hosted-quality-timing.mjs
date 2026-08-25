#!/usr/bin/env node
/* global console, process */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOPOLOGIES = {
  'remote-quality': {
    nodes: [
      ['dev-ref', ['dev-ref']],
      ['scoped-quality', ['scoped-quality']],
      ['t5-baseline', ['t5-baseline']],
      ['full-quality', ['full-quality']]
    ],
    edges: [['dev-ref', 'scoped-quality'], ['dev-ref', 't5-baseline'], ['t5-baseline', 'full-quality']]
  },
  't7-release': {
    nodes: [
      ['release_context', ['Resolve release identity']],
      ['t6_quality', ['t6_quality', 'T6 hosted quality']],
      ['release_candidate', ['release_candidate', 'Release candidate quality']],
      ['macos_package', ['macos_package', 'macOS package']],
      ['windows_package', ['windows_package', 'Windows package']],
      ['linux_package', ['linux_package', 'Linux Experimental package']],
      ['assemble_draft', ['Assemble release draft']]
    ],
    edges: [
      ['release_context', 't6_quality'], ['t6_quality', 'release_candidate'],
      ['release_candidate', 'macos_package'], ['release_candidate', 'windows_package'],
      ['release_candidate', 'linux_package'], ['macos_package', 'assemble_draft'],
      ['windows_package', 'assemble_draft'], ['linux_package', 'assemble_draft']
    ]
  }
};

const time = (value) => value ? Date.parse(value) : null;
const seconds = (value) => value == null ? null : Math.round(value / 1000);

function timedJobs(jobs) {
  return jobs.filter((job) => !job.name.includes('Capacity timing summary')).map((job) => ({
    conclusion: job.conclusion, created: time(job.created_at), completed: time(job.completed_at),
    name: job.name, started: time(job.started_at), status: job.status
  }));
}

function peakConcurrency(jobs) {
  const events = jobs.flatMap((job) => job.started != null && job.completed != null
    ? [[job.started, 1], [job.completed, -1]] : []);
  events.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let active = 0;
  return events.reduce((peak, [, delta]) => {
    active += delta;
    return Math.max(peak, active);
  }, 0);
}

function groupJobs(jobs, topology) {
  return Object.fromEntries(topology.nodes.flatMap(([id, matchers]) => {
    const selected = jobs.filter((job) => matchers.some((matcher) => (
      job.name === matcher || job.name.startsWith(`${matcher} /`)
    )));
    const starts = selected.map((job) => job.started).filter(Number.isFinite);
    const ends = selected.map((job) => job.completed).filter(Number.isFinite);
    return starts.length && ends.length ? [[id, {
      start: Math.min(...starts), end: Math.max(...ends)
    }]] : [];
  }));
}

function criticalChain(jobs, topology) {
  if (!topology) return null;
  const groups = groupJobs(jobs, topology);
  const scores = {};
  for (const [id] of topology.nodes) {
    if (!groups[id]) continue;
    const predecessors = topology.edges.filter(([, target]) => target === id)
      .map(([source]) => source).filter((source) => scores[source]);
    const best = predecessors.sort((left, right) => scores[right].score - scores[left].score)[0];
    scores[id] = {
      path: [...(best ? scores[best].path : []), id],
      score: (best ? scores[best].score : 0) + groups[id].end - groups[id].start
    };
  }
  const best = Object.values(scores).sort((left, right) => right.score - left.score)[0];
  if (!best) return null;
  return { nodes: best.path, observedSeconds: seconds(
    groups[best.path.at(-1)].end - groups[best.path[0]].start
  ) };
}

function metrics(section, topologyName) {
  const jobs = timedJobs(section.jobs);
  const complete = jobs.filter((job) => job.created != null && job.completed != null);
  const queues = jobs.filter((job) => job.created != null && job.started != null)
    .map((job) => ({ name: job.name, value: job.started - job.created }));
  const executions = jobs.filter((job) => job.started != null && job.completed != null)
    .map((job) => job.completed - job.started);
  const longestQueue = queues.sort((left, right) => right.value - left.value)[0] ?? null;
  return {
    wallSeconds: complete.length ? seconds(
      Math.max(...complete.map((job) => job.completed)) - time(section.run.created_at)
    ) : null,
    queueSeconds: seconds(queues.reduce((sum, entry) => sum + entry.value, 0)),
    executionSeconds: seconds(executions.reduce((sum, value) => sum + value, 0)),
    peak: peakConcurrency(jobs),
    longestQueue: longestQueue ? { name: longestQueue.name, seconds: seconds(longestQueue.value) } : null,
    criticalChain: criticalChain(jobs, TOPOLOGIES[topologyName]),
    incompleteJobs: jobs.filter((job) => job.started == null || job.completed == null).map((job) => job.name)
  };
}

export function analyzeHostedQualityTiming(input) {
  const current = metrics(input.current, input.topology);
  const baseline = input.baseline ? metrics(input.baseline, input.topology) : null;
  return {
    topology: input.topology, current, baseline,
    wallDeltaSeconds: baseline && current.wallSeconds != null && baseline.wallSeconds != null
      ? current.wallSeconds - baseline.wallSeconds : null,
    dependencyPrecision: current.criticalChain
      ? 'top-level needs chain proven; nested reusable-workflow edges unknown'
      : 'unknown'
  };
}

const duration = (value) => {
  if (value == null) return 'unknown';
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 60)}m ${absolute % 60}s`;
};

export function renderHostedQualityTiming(report) {
  const current = report.current;
  const chain = current.criticalChain?.nodes.join(' → ') ?? 'unknown';
  const baseline = report.baseline ? duration(report.baseline.wallSeconds) : 'unavailable';
  return [
    '## Hosted quality capacity timing',
    '',
    `- Workflow wall: ${duration(current.wallSeconds)} (recent success: ${baseline}; delta: ${duration(report.wallDeltaSeconds)})`,
    `- API queue total: ${duration(current.queueSeconds)}; execution total: ${duration(current.executionSeconds)}`,
    `- Peak runner-backed jobs: ${current.peak}`,
    `- Longest queue: ${current.longestQueue?.name ?? 'unknown'} (${duration(current.longestQueue?.seconds)})`,
    `- Critical top-level dependency chain: ${chain} (${duration(current.criticalChain?.observedSeconds)})`,
    `- Dependency precision: ${report.dependencyPrecision}`,
    `- Missing terminal timestamps: ${current.incompleteJobs.join(', ') || 'none'}`,
    ''
  ].join('\n');
}

async function main() {
  const inputPath = process.argv[2];
  const reportPath = process.argv[3];
  const markdownPath = process.argv[4];
  if (!inputPath || !reportPath || !markdownPath) throw new Error('usage: hosted-quality-timing <input> <json> <md>');
  const report = analyzeHostedQualityTiming(JSON.parse(await readFile(inputPath, 'utf8')));
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderHostedQualityTiming(report));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
