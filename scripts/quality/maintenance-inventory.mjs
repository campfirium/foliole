#!/usr/bin/env node
/* global console, process */

// Default quality-maintenance inventory: checks that the four maintenance entry points and
// their docs exist, finds each one's newest report, and checks the mechanism guards. Read-only;
// it never runs a maintenance item.
//
//   node scripts/quality/maintenance-inventory.mjs [--repo <checkout>] [--artifacts <dir>] [--json]

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_REPO_ROOT } from './maintenance-git.mjs';
import { GATE_WIRING_SOURCES, MAINTENANCE_ENTRIES, MECHANISM_GUARDS } from './maintenance-inventory-catalog.mjs';

function checkCommand(repoRoot, packageScripts, command) {
  if (command.file) {
    const present = existsSync(path.join(repoRoot, command.file));
    return { text: `node ${command.file}`, ok: present, note: present ? '' : '脚本缺失' };
  }
  const script = packageScripts[command.npmScript];
  if (!script) return { text: `npm run ${command.npmScript}`, ok: false, note: 'package.json 无此脚本' };
  const target = script.match(/(scripts\/\S+\.(?:mjs|js|py|sh))/u)?.[1];
  const targetOk = !target || existsSync(path.join(repoRoot, target));
  return { text: `npm run ${command.npmScript}`, ok: targetOk, note: targetOk ? '' : `入口 ${target} 缺失` };
}

export function inspectEntries(repoRoot, artifactsRoot) {
  const packageScripts = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts ?? {};
  return MAINTENANCE_ENTRIES.map((entry) => ({
    id: entry.id,
    label: entry.label,
    command: checkCommand(repoRoot, packageScripts, entry.command),
    docs: entry.docs.map((doc) => ({ path: doc, ok: existsSync(path.join(repoRoot, doc)) })),
    report: entry.readLatestReport(artifactsRoot)
  }));
}

function gateWiringText(repoRoot) {
  const files = [...GATE_WIRING_SOURCES.files];
  for (const directory of GATE_WIRING_SOURCES.directories) {
    const absolute = path.join(repoRoot, directory.path);
    if (!existsSync(absolute)) continue;
    files.push(...readdirSync(absolute).filter((name) => directory.pattern.test(name)).map((name) => path.join(directory.path, name)));
  }
  return files.filter((file) => existsSync(path.join(repoRoot, file)))
    .map((file) => ({ file, text: readFileSync(path.join(repoRoot, file), 'utf8') }));
}

function trackedFiles(repoRoot) {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n');
}

function markerFiles(repoRoot, marker) {
  try {
    return execFileSync('git', ['grep', '-l', '-F', marker.text, '--', marker.pathspec], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function guardFiles(repoRoot, guard, tracked) {
  if (guard.filePattern) return { found: tracked.filter((file) => guard.filePattern.test(file)), missing: [] };
  if (guard.marker) return { found: markerFiles(repoRoot, guard.marker), missing: [] };
  const found = guard.files.filter((file) => existsSync(path.join(repoRoot, file)));
  return { found, missing: guard.files.filter((file) => !found.includes(file)) };
}

function guardWiring(guard, found, wiringSources) {
  if (found.length === 0) return '—';
  if (guard.wiring === 'runtime') return '运行时代码，不经质检';
  if (guard.wiring === 'test') return '测试文件，由质检收集';
  const names = found.map((file) => path.basename(file, path.extname(file)));
  const wiredBy = wiringSources.filter((source) => names.some((name) => source.text.includes(name))).map((source) => source.file);
  return wiredBy.length > 0 ? `已接入：${wiredBy.join(', ')}` : '未接入质检';
}

export function inspectGuards(repoRoot) {
  const tracked = trackedFiles(repoRoot);
  const wiringSources = gateWiringText(repoRoot);
  return MECHANISM_GUARDS.map((guard) => {
    const { found, missing } = guardFiles(repoRoot, guard, tracked);
    const landed = found.length > 0 && missing.length === 0;
    const counted = guard.count && existsSync(path.join(repoRoot, guard.count.file))
      ? `${guard.count.label} ${readFileSync(path.join(repoRoot, guard.count.file), 'utf8').match(guard.count.pattern)?.length ?? 0} 条`
      : null;
    return {
      label: guard.label,
      status: landed ? '已落地' : found.length > 0 ? '部分缺失' : '未落地',
      files: found,
      missing,
      wiring: guardWiring(guard, found, wiringSources),
      count: counted
    };
  });
}

function reportCell(report, repoRoot) {
  if (!report.path) return { where: '未取得', date: '—', status: '—' };
  const where = path.relative(repoRoot, report.path).startsWith('..') ? report.path : path.relative(repoRoot, report.path);
  return { where: `\`${where}\``, date: report.date.slice(0, 10), status: `${report.status}；${report.detail}` };
}

export function renderInventoryMarkdown({ repoRoot, artifactsRoot, entries, guards }) {
  const lines = [`入口盘点（只读，本次未执行任何维护项）；报告目录 \`${artifactsRoot}\``, '',
    '| 项目 | 命令 | 说明文件 | 最新报告 | 日期 | 状态 |', '| --- | --- | --- | --- | --- | --- |'];
  for (const entry of entries) {
    const report = reportCell(entry.report, repoRoot);
    const command = `\`${entry.command.text}\`${entry.command.ok ? '' : `（${entry.command.note}）`}`;
    const docs = entry.docs.map((doc) => `${doc.ok ? '' : '缺失 '}\`${doc.path}\``).join('<br>');
    lines.push(`| ${entry.label} | ${command} | ${docs} | ${report.where} | ${report.date} | ${report.status} |`);
  }
  lines.push('', '| 机制守卫 | 状态 | 文件 | 质检接入 | 备注 |', '| --- | --- | --- | --- | --- |');
  for (const guard of guards) {
    const files = guard.files.length > 3 ? `${guard.files.length} 个文件` : guard.files.map((file) => `\`${file}\``).join('<br>') || '—';
    const notes = [guard.count, guard.missing.length > 0 ? `缺失 ${guard.missing.join(', ')}` : null].filter(Boolean).join('；') || '—';
    lines.push(`| ${guard.label} | ${guard.status} | ${files} | ${guard.wiring} | ${notes} |`);
  }
  return lines.join('\n');
}

export function runInventory(argv) {
  const args = { json: argv.includes('--json') };
  for (const flag of ['--repo', '--artifacts']) {
    const index = argv.indexOf(flag);
    if (index >= 0) args[flag.slice(2)] = argv[index + 1];
  }
  const repoRoot = path.resolve(args.repo ?? DEFAULT_REPO_ROOT);
  const artifactsRoot = path.resolve(args.artifacts ?? path.join(repoRoot, '.tmp/artifacts'));
  const result = { repoRoot, artifactsRoot, entries: inspectEntries(repoRoot, artifactsRoot), guards: inspectGuards(repoRoot) };
  return args.json ? JSON.stringify(result, null, 2) : renderInventoryMarkdown(result);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(runInventory(process.argv.slice(2)));
}
