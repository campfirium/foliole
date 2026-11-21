// Finds the newest report of each maintenance entry under the artifacts root and
// summarises its date and status. Read-only; unreadable reports are counted, not fatal.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function listDirectories(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Picks the candidate with the newest `date`; `candidates` yields { path, read() }. */
function newest(candidates) {
  let best = null;
  let unreadable = 0;
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue;
    const summary = candidate.read();
    if (!summary?.date) {
      unreadable += 1;
      continue;
    }
    if (!best || summary.date > best.date) best = { path: candidate.path, ...summary };
  }
  return best ? { ...best, unreadable } : { path: null, unreadable };
}

function summariseIntegration(report) {
  const results = report.results ?? [];
  const date = results.map((result) => result.finishedAt ?? result.startedAt).filter(Boolean).sort().at(-1);
  const failed = results.filter((result) => result.exitCode !== 0).map((result) => result.name);
  const status = report.exitCode === 0 && failed.length === 0 ? '通过' : `失败（${failed.join(', ') || `exit ${report.exitCode}`}）`;
  const detail = `scope ${report.options?.scope ?? '?'}，${results.length} 个场景，sourceStable ${report.sourceStable}`;
  return { date, status, detail };
}

export function readSystemIntegrationReport(artifactsRoot) {
  const root = path.join(artifactsRoot, 'system-integration');
  return newest(listDirectories(root).map((name) => {
    const filePath = path.join(root, name, 'summary.json');
    return { path: filePath, read: () => { const report = readJson(filePath); return report && summariseIntegration(report); } };
  }));
}

function summariseDatabaseDirectory(directory) {
  const reports = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(path.join(directory, name)))
    .filter((report) => report?.integrity && report.capturedAt);
  if (reports.length === 0) return null;
  const broken = reports.filter((report) => !report.integrity.ok || report.foreignKeyViolationCount > 0);
  return {
    date: reports.map((report) => report.capturedAt).sort().at(-1),
    status: broken.length === 0 ? '完整性正常' : `完整性异常（${broken.map((report) => report.label).join(', ')}）`,
    detail: `库：${[...new Set(reports.map((report) => report.label))].join(', ')}`
  };
}

export function readDatabaseAuditReport(artifactsRoot) {
  const root = path.join(artifactsRoot, 'quality-maintenance');
  return newest(listDirectories(root).map((name) => {
    const directory = path.join(root, name, 'database');
    return { path: directory, read: () => summariseDatabaseDirectory(directory) };
  }));
}

function summariseBenchmark(summary) {
  const manifest = summary.manifest ?? {};
  return {
    date: manifest.capturedAt,
    status: summary.verdict ?? '无 verdict',
    detail: `mode ${manifest.options?.mode ?? '?'}，规模 ${(manifest.options?.sizes ?? []).join('/')}`
  };
}

export function readBenchmarkReport(artifactsRoot) {
  return newest(listDirectories(artifactsRoot).filter((name) => name.startsWith('t285-')).map((name) => {
    const filePath = path.join(artifactsRoot, name, 'summary.json');
    return { path: filePath, read: () => { const report = readJson(filePath); return report && summariseBenchmark(report); } };
  }));
}

function summariseDrill(report) {
  const tests = report.tests ?? {};
  return {
    date: report.endedAt ?? report.startedAt,
    status: report.status ?? `exit ${report.exitCode}`,
    detail: `profile ${report.profile}，测试 ${tests.passed ?? '?'}/${tests.total ?? '?'}，candidateStable ${report.candidateStable}`
  };
}

export function readDrillReport(artifactsRoot) {
  const root = path.join(artifactsRoot, 't286-drills');
  return newest(listDirectories(root).map((name) => {
    const filePath = path.join(root, name, 'report.json');
    return { path: filePath, read: () => { const report = readJson(filePath); return report && summariseDrill(report); } };
  }));
}
