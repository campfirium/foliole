#!/usr/bin/env node
/* global console, process, setTimeout */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseArgs as parseAuditArgs, runAudit } from './android-sync-audit.mjs';

const DEFAULT_SAMPLE_SECONDS = [0, 3, 6, 15];

function parseArgs(argv) {
  const options = {
    ...parseAuditArgs(argv),
    atSeconds: DEFAULT_SAMPLE_SECONDS,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--at' && value) {
      options.atSeconds = parseSampleSeconds(value);
      index += 1;
    } else if (key === '--json') {
      options.json = true;
    }
  }
  return options;
}

function parseSampleSeconds(value) {
  const seconds = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0);
  return [...new Set(seconds)].sort((left, right) => left - right);
}

async function sampleSyncScenario(options, runner = runAudit, sleeper = sleep) {
  const startedAt = Date.now();
  let previousSecond = 0;
  const samples = [];
  for (const targetSecond of options.atSeconds) {
    await sleeper(Math.max(0, targetSecond - previousSecond) * 1000);
    previousSecond = targetSecond;
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    try {
      const { report } = await runner(options);
      samples.push(summarizeSample(report, elapsedSeconds, targetSecond));
    } catch (error) {
      samples.push(summarizeFailedSample(error, elapsedSeconds, targetSecond));
    }
  }
  return { samples, startedAt: new Date(startedAt).toISOString() };
}

function summarizeSample(report, elapsedSeconds, targetSecond) {
  const counts = structureCounts(report);
  return {
    cursor: report.cursors,
    elapsedSeconds,
    endpoint: report.identity.androidEndpoint ?? 'missing',
    localPush: report.localPush,
    resources: report.resources,
    run: report.syncEvents.latestRun,
    serial: report.identity.androidSerial ?? 'local-db',
    structural: counts,
    suspectedLayer: report.suspectedBrokenLayer,
    targetSecond
  };
}

function summarizeFailedSample(error, elapsedSeconds, targetSecond) {
  return {
    elapsedSeconds,
    error: error instanceof Error ? error.message : String(error),
    targetSecond
  };
}

function structureCounts(report) {
  return Object.fromEntries(report.structural.map((item) => [item.name, {
    android: item.androidCount,
    desktop: item.desktopCount,
    missing: item.missingOnAndroid.length
  }]));
}

function formatScenarioReport(result) {
  return result.samples.map(formatScenarioSample).join('\n\n');
}

function formatScenarioSample(sample) {
  if (sample.error) {
    return [
      `=== t+${sample.targetSecond}s sampled at +${sample.elapsedSeconds}s ===`,
      `sample_failed=${sample.error}`
    ].join('\n');
  }
  return [
    `=== t+${sample.targetSecond}s sampled at +${sample.elapsedSeconds}s ===`,
    `serial=${sample.serial} endpoint=${sample.endpoint}`,
    `cursor android=${sample.cursor.androidCursor} desktop=${sample.cursor.desktopMaxSeq} gap=${sample.cursor.gap}`,
    `structure nodes=${formatCount(sample.structural.nodes)} node_order=${formatCount(sample.structural.node_order)} external_documents=${formatCount(sample.structural.external_documents)}`,
    `pending live=${sample.cursor.pending.liveCount} tombstones=${sample.cursor.pending.tombstoneCount}`,
    `resources node_bodies=${sample.resources.missingNodeBodies} external_bodies=${sample.resources.missingExternalDocumentBodies} attachments=${sample.resources.missingAttachmentResources}`,
    `local_push dirty=${sample.localPush?.dirtyCount ?? 'n/a'} issues=${sample.localPush?.issueCount ?? 'n/a'} latest_run=${formatRun(sample.run)}`,
    `suspected=${sample.suspectedLayer}`
  ].join('\n');
}

function formatCount(value) {
  if (!value) return 'n/a';
  return `${value.android}/${value.desktop} missing=${value.missing}`;
}

function formatRun(run) {
  if (!run) return 'none';
  return `${run.result ?? 'unknown'}:${run.message}`.trim();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  sampleSyncScenario(options)
    .then((result) => console.log(options.json ? JSON.stringify(result, null, 2) : formatScenarioReport(result)))
    .catch((error) => {
      console.error(`[android-sync-scenario] FAILED ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}

export { formatScenarioReport, parseArgs, sampleSyncScenario, summarizeSample };
