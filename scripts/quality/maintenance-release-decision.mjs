// Decides, per release-time maintenance item, whether this release runs it.
// The range for each item starts at the release that item last ran for (from the
// ledger), not at the previous release, so skipped items keep accumulating changes.

import {
  changedFiles,
  daysBetween,
  releaseTagsBetween,
  resolveCommit
} from './maintenance-git.mjs';
import { latestRun } from './maintenance-ledger.mjs';
import { FORCE_AFTER_DAYS, FORCE_AFTER_RELEASES, RELEASE_ITEMS, isProductionPath } from './maintenance-release-rules.mjs';

function resolveRunStart(cwd, run) {
  if (run.release) {
    const tagged = resolveCommit(cwd, run.release);
    if (tagged) return { commit: tagged, label: run.release };
  }
  if (run.revision) {
    const commit = resolveCommit(cwd, run.revision);
    if (commit) return { commit, label: run.release ? `${run.release}（未打 tag，按 ${run.revision.slice(0, 9)}）` : run.revision.slice(0, 9) };
  }
  return null;
}

function fallback(run, releasesSince, today) {
  const age = daysBetween(run.date, today);
  const releaseNumber = releasesSince.length + 1;
  const reasons = [];
  if (releaseNumber >= FORCE_AFTER_RELEASES) reasons.push(`本次是上次执行后的第 ${releaseNumber} 次发布`);
  if (age > FORCE_AFTER_DAYS) reasons.push(`距上次执行 ${age} 天`);
  return { age, reasons };
}

function describeTriggers(paths) {
  const sample = paths.slice(0, 3).join(', ');
  return paths.length > 3 ? `${sample} 等 ${paths.length} 个` : sample;
}

function decideMode(item, files, hasHistory) {
  if (!item.modes) return null;
  const triggers = item.modeTrigger(files);
  if (!hasHistory) return { mode: item.modes.escalated, reason: `无记录，按 ${item.modes.escalated}` };
  if (triggers.length > 0) {
    return { mode: item.modes.escalated, reason: `用 ${item.modes.escalated}：区间改过 ${describeTriggers(triggers)}` };
  }
  return { mode: item.modes.base, reason: `用 ${item.modes.base}：区间未改 schema/迁移/启动/恢复路径` };
}

function neverRun(item, reason, runAll) {
  const mode = decideMode(item, [], false);
  return {
    item: item.id,
    label: item.label,
    last: null,
    range: null,
    changedCount: null,
    productionCount: null,
    triggers: item.when ? [] : null,
    modeTriggers: null,
    run: true,
    mode: mode?.mode ?? null,
    reasons: [runAll ? '用户要求全跑' : null, reason, mode?.reason].filter(Boolean)
  };
}

function decideItem({ cwd, item, ledger, target, today, runAll }) {
  const run = latestRun(ledger, item.id);
  if (!run) return neverRun(item, '台账无记录，视为从未执行', runAll);
  const start = resolveRunStart(cwd, run);
  if (!start) return neverRun(item, `上次记录 ${run.release ?? run.revision} 在仓库中找不到`, runAll);
  const files = changedFiles(cwd, start.commit, target);
  const releasesSince = releaseTagsBetween(cwd, start.commit, target);
  const triggers = item.when ? item.when(files) : [];
  const forced = fallback(run, releasesSince, today);
  const mode = decideMode(item, files, true);
  const reasons = [];
  if (runAll) reasons.push('用户要求全跑');
  if (!item.when) reasons.push('每次执行');
  else if (triggers.length > 0) reasons.push(`区间改过 ${describeTriggers(triggers)}`);
  if (forced.reasons.length > 0) reasons.push(`兜底：${forced.reasons.join('，')}`);
  const runIt = runAll || !item.when || triggers.length > 0 || forced.reasons.length > 0;
  if (!runIt) reasons.push('区间未命中执行条件');
  if (item.manualTrigger && !runIt) reasons.push(`另：${item.manualTrigger}`);
  if (mode) reasons.push(mode.reason);
  return {
    item: item.id,
    label: item.label,
    last: { release: run.release ?? null, date: run.date, ageDays: forced.age, releasesSince },
    range: start.label,
    changedCount: files.length,
    productionCount: files.filter(isProductionPath).length,
    triggers: item.when ? triggers : null,
    modeTriggers: item.modes ? item.modeTrigger(files).length : null,
    run: runIt,
    mode: mode?.mode ?? null,
    reasons
  };
}

export function planReleaseMaintenance({ cwd, ledger, target = 'dev', today, runAll = false, items = RELEASE_ITEMS }) {
  const targetCommit = resolveCommit(cwd, target);
  if (!targetCommit) throw new Error(`target not found: ${target}`);
  return {
    target,
    targetCommit,
    today,
    runAll,
    items: items.map((item) => decideItem({ cwd, item, ledger, target: targetCommit, today, runAll }))
  };
}
