#!/usr/bin/env node
/* global console, process */

// Draft of the "发布前质量维护" decision table: per item, the range since the release it
// last ran for, the changed paths that trigger it, and run/skip with the reason. The agent
// reviews boundary cases; `--record` appends completed runs to the ledger.
//
//   node scripts/quality/maintenance-release-plan.mjs [--target dev] [--all] [--json]
//   node scripts/quality/maintenance-release-plan.mjs --record <item,...|all> --release vX.Y.Z
//        [--revision <ref>] [--date YYYY-MM-DD] [--note <text>]

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveStaticQualityRoute } from '../lib/path-domains.mjs';
import { changedFiles, DEFAULT_REPO_ROOT, latestReleaseTag, resolveCommit, todayIso } from './maintenance-git.mjs';
import { appendRuns, readLedger, resolveLedgerPath, writeLedger } from './maintenance-ledger.mjs';
import { planReleaseMaintenance } from './maintenance-release-decision.mjs';
import { RELEASE_ITEM_IDS } from './maintenance-release-rules.mjs';

const VALUE_FLAGS = new Set(['--target', '--ledger', '--today', '--record', '--release', '--revision', '--date', '--note', '--repo']);

export function parseArgs(argv) {
  const args = { all: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (VALUE_FLAGS.has(flag)) args[flag.slice(2)] = argv[++index];
    else if (flag === '--all') args.all = true;
    else if (flag === '--json') args.json = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  return args;
}

function escapeCell(text) {
  return String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function lastRunCell(entry) {
  if (!entry.last) return '无记录';
  return `${entry.last.release ?? '—'}（${entry.last.date}，${entry.last.ageDays} 天前）`;
}

function changeCell(entry) {
  if (entry.changedCount === null) return '—';
  const base = `${entry.changedCount} 个文件，产品路径 ${entry.productionCount} 个`;
  if (entry.triggers) return `${base}，命中 ${entry.triggers.length} 个`;
  return entry.modeTriggers === null ? base : `${base}，升档路径 ${entry.modeTriggers} 个`;
}

function decisionCell(entry) {
  if (!entry.run) return '跳过';
  return entry.mode ? `执行（${entry.mode}）` : '执行';
}

export function renderReleasePlanMarkdown(plan, route) {
  const lines = [
    `目标：\`${plan.target}\` @ ${plan.targetCommit.slice(0, 9)}，日期 ${plan.today}${plan.runAll ? '，用户要求全跑' : ''}`,
    route ? `路径域（自 ${route.since} 起，path-domains）：${route.level} — ${route.reason}` : null,
    '',
    '| 项目 | 上次执行 | 区间起点 | 区间变更 | 结论 | 理由 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...plan.items.map((entry) =>
      [entry.label, lastRunCell(entry), entry.range ?? '—', changeCell(entry), decisionCell(entry), entry.reasons.join('；')]
        .map(escapeCell)
        .join(' | ')
    ).map((row) => `| ${row} |`)
  ];
  return lines.filter((line) => line !== null).join('\n');
}

function pathDomainRoute(cwd, targetCommit) {
  const since = latestReleaseTag(cwd, targetCommit);
  if (!since) return null;
  const route = resolveStaticQualityRoute(changedFiles(cwd, since, targetCommit));
  return route ? { since, ...route } : { since, level: 'none', reason: 'no routed path changed' };
}

function recordRuns(repoRoot, ledgerPath, args) {
  const items = args.record === 'all' ? RELEASE_ITEM_IDS : args.record.split(',').map((item) => item.trim());
  const revision = resolveCommit(repoRoot, args.revision ?? args.target ?? 'dev');
  if (!revision) throw new Error(`revision not found: ${args.revision ?? args.target ?? 'dev'}`);
  const runs = items.map((item) => ({
    item,
    release: args.release ?? null,
    revision,
    date: args.date ?? todayIso(),
    ...(args.note ? { note: args.note } : {})
  }));
  writeLedger(ledgerPath, appendRuns(readLedger(ledgerPath), runs, RELEASE_ITEM_IDS));
  return `recorded ${runs.length} run(s) in ${path.relative(repoRoot, ledgerPath)}: ${items.join(', ')}`;
}

export function runCli(argv) {
  const args = parseArgs(argv);
  const repoRoot = path.resolve(args.repo ?? DEFAULT_REPO_ROOT);
  const ledgerPath = resolveLedgerPath(repoRoot, args.ledger);
  if (args.record) return recordRuns(repoRoot, ledgerPath, args);
  const plan = planReleaseMaintenance({
    cwd: repoRoot,
    ledger: readLedger(ledgerPath),
    target: args.target ?? 'dev',
    today: args.today ?? todayIso(),
    runAll: args.all
  });
  if (args.json) return JSON.stringify(plan, null, 2);
  return renderReleasePlanMarkdown(plan, pathDomainRoute(repoRoot, plan.targetCommit));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    console.log(runCli(process.argv.slice(2)));
  } catch (error) {
    console.error(`[maintenance-release-plan] ${error.message}`);
    process.exitCode = 1;
  }
}
