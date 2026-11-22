import fs from 'node:fs';
import path from 'node:path';

import { DAY_MS } from './scheduled-disk-cleanup-steps.mjs';

const REPORT_KEEP_MS = 90 * DAY_MS;
const HELPER_REPORT_PATTERN = /^(\d{4})(\d{2})(\d{2})-\d{6}$/u;

export function gib(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(1)}G`;
}

function stamp(nowMs) {
  return new Date(nowMs).toISOString().replaceAll(/[-:]/gu, '').replace(/\.\d+Z$/u, 'Z');
}

export function freedBytes(report) {
  const steps = report.steps;
  const sum = (items = []) => items.reduce((total, item) => total + (item.bytes ?? 0), 0);
  return sum(steps.closedTasks?.removed) + (steps.templates?.bytes ?? 0) + (steps.registeredRuns?.bytes ?? 0)
    + (steps.tmpLoose?.bytes ?? 0) + sum(steps.cache?.removed) + sum(steps.quarantinePurge?.removed);
}

function line(name, step) {
  if (!step) return `- ${name}：未执行`;
  if (step.status === 'failed') return `- ${name}：失败（${step.error}）`;
  if (step.status === 'skipped') return `- ${name}：跳过（${step.reason}）`;
  return `- ${name}：${step.summary ?? '完成'}`;
}

export function renderSummary(report) {
  const { free, steps } = report;
  const rows = [
    `# Foliole 定时清理 ${report.finishedAt}`,
    '',
    `状态：${report.status}${report.preview ? '（预览，未删除）' : ''}；原因：${report.reasons.join('、') || '手动'}`,
    `腾出（文件统计）：${gib(freedBytes(report))}；移入隔离区：${gib((steps.quarantine?.moved ?? []).reduce((t, i) => t + i.bytes, 0))}`,
    `UD 空闲：${gib(free.before.ud)} → ${gib(free.after.ud)}；内盘空闲：${gib(free.before.internal)} → ${gib(free.after.internal)}`,
    '',
    line('已关闭任务产物', steps.closedTasks),
    line('临时工作树', steps.worktrees),
    line('A5 构建模板', steps.templates),
    line('登记类别的旧运行', steps.registeredRuns),
    line('.tmp 零散旧文件', steps.tmpLoose),
    line('.cache 30 天未用', steps.cache),
    line('隔离区到期删除', steps.quarantinePurge),
    line('无任务号目录移入隔离区', steps.quarantine),
    ''
  ];
  if (report.overCap?.length) {
    rows.push('## 超过 5G 的任务', ...report.overCap.map((item) => `- ${item.task}：${gib(item.bytes)}`), '');
  }
  const moved = [...(steps.quarantine?.moved ?? [])].sort((left, right) => right.bytes - left.bytes);
  if (moved.length) {
    rows.push(`## 本轮移入隔离区（可移回，按体积前 30 项，共 ${moved.length} 项）`,
      ...moved.slice(0, 30).map((item) => `- ${item.from} → ${item.to}（${gib(item.bytes)}）`), '');
  }
  if (report.interruptedBy) rows.push(`中途停止：${report.interruptedBy}`, '');
  rows.push(`完整记录：${report.reportPath}`, '');
  return rows.join('\n');
}

export function writeReport(reportRoot, report, nowMs) {
  fs.mkdirSync(reportRoot, { recursive: true });
  const reportPath = path.join(reportRoot, `${stamp(nowMs)}.json`);
  const full = { ...report, reportPath };
  fs.writeFileSync(reportPath, `${JSON.stringify(full, null, 2)}\n`);
  fs.writeFileSync(path.join(reportRoot, 'latest.md'), renderSummary(full));
  return full;
}

// Keeps 90 days of scheduled reports and of the closed-task helper's own report folders.
export function pruneOldReports({ helperReportRoot, nowMs, reportRoot }) {
  const removed = [];
  if (fs.existsSync(reportRoot)) {
    for (const name of fs.readdirSync(reportRoot).filter((entry) => entry.endsWith('.json'))) {
      const filePath = path.join(reportRoot, name);
      if (nowMs - fs.statSync(filePath).mtimeMs > REPORT_KEEP_MS) { fs.rmSync(filePath); removed.push(filePath); }
    }
  }
  if (fs.existsSync(helperReportRoot)) {
    for (const name of fs.readdirSync(helperReportRoot)) {
      const match = HELPER_REPORT_PATTERN.exec(name);
      if (!match || nowMs - Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) <= REPORT_KEEP_MS) continue;
      fs.rmSync(path.join(helperReportRoot, name), { force: true, recursive: true });
      removed.push(path.join(helperReportRoot, name));
    }
  }
  return removed;
}
