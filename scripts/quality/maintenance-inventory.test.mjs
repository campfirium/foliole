// @vitest-environment node
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectEntries, inspectGuards, runInventory } from './maintenance-inventory.mjs';
import { createTestRepo } from './maintenance-test-repo.test-support.mjs';

let repo;
afterEach(() => repo?.cleanup());

const PACKAGE_JSON = JSON.stringify({
  scripts: {
    'integration:maintain': 'node scripts/system-integration-maintenance.mjs',
    'database:audit': 'node --no-warnings scripts/database/database-audit.mjs'
  }
});

function seedCheckout() {
  repo = createTestRepo();
  repo.commit('seed', {
    'package.json': PACKAGE_JSON,
    'scripts/system-integration-maintenance.mjs': '',
    'scripts/README.system-integration.md': '',
    'docs/maintenance/database-audit.md': '',
    'scripts/sqlite/upgrade-recovery-drills.mjs': '',
    'scripts/sqlite/README.upgrade-recovery-drills.md': '',
    'scripts/quality/unstable-reference-heavy-work.mjs': '',
    'src/companion/companionTrash.workAmplification.integration.test.ts': '',
    'electron/database/runtimeScaleGuard.integration.test.ts': '',
    'electron/database/scaleGuardKnownFindings.testSupport.ts': "const A = {\n  reason: 'x'\n};\nconst B = {\n  reason: 'y'\n};\n"
  });
}

function writeJson(relativePath, value) {
  repo.write(path.join('artifacts', relativePath), typeof value === 'string' ? value : JSON.stringify(value));
}

function integrationReport(finishedAt, results) {
  return { options: { scope: 'all' }, sourceStable: true, exitCode: results.every((r) => r.exitCode === 0) ? 0 : 1,
    results: results.map((result) => ({ ...result, finishedAt })) };
}

describe('maintenance inventory', () => {
  it('reports missing entry points and docs and picks the newest readable report', () => {
    seedCheckout();
    writeJson('system-integration/old/summary.json', integrationReport('2026-11-01T00:00:00Z', [{ name: 'journey', exitCode: 0 }]));
    writeJson('system-integration/new/summary.json',
      integrationReport('2026-11-06T00:00:00Z', [{ name: 'journey', exitCode: 0 }, { name: 'review', exitCode: 1 }]));
    writeJson('system-integration/broken/summary.json', '{not json');
    writeJson('t286-drills/release-a/report.json',
      { profile: 'release', endedAt: '2026-11-05T00:00:00Z', status: 'passed', tests: { passed: 3, total: 3 }, candidateStable: true });
    writeJson('quality-maintenance/run1/database/main.json',
      { label: 'main', capturedAt: '2026-11-04T00:00:00Z', integrity: { ok: true }, foreignKeyViolationCount: 2 });
    const entries = Object.fromEntries(inspectEntries(repo.root, path.join(repo.root, 'artifacts')).map((e) => [e.id, e]));

    expect(entries['system-integration'].report).toMatchObject({ date: '2026-11-06T00:00:00Z', status: '失败（review）', unreadable: 1 });
    expect(entries['system-integration'].report.path).toContain(path.join('new', 'summary.json'));
    expect(entries['database-audit'].command.ok).toBe(false);
    expect(entries['database-audit'].command.note).toContain('scripts/database/database-audit.mjs');
    expect(entries['database-audit'].docs).toEqual([
      { path: 'docs/maintenance/database-audit.md', ok: true },
      { path: 'docs/maintenance/database-audit-tables.md', ok: false }
    ]);
    expect(entries['database-audit'].report.status).toBe('完整性异常（main）');
    expect(entries.benchmark.command).toMatchObject({ ok: false, note: 'package.json 无此脚本' });
    expect(entries.benchmark.report.path).toBeNull();
    expect(entries['upgrade-recovery'].report).toMatchObject({ status: 'passed', date: '2026-11-05T00:00:00Z' });
  });

  it('marks guards as landed, partial or missing and detects gate wiring', () => {
    seedCheckout();
    const guards = Object.fromEntries(inspectGuards(repo.root).map((guard) => [guard.label, guard]));
    expect(guards['引用不稳定扫描']).toMatchObject({ status: '已落地', wiring: '未接入质检' });
    expect(guards['手机端单点操作次数测试']).toMatchObject({ status: '已落地', wiring: '测试文件，由质检收集' });
    expect(guards['桌面 runtimeScaleGuard 与 sqlQueryBudget']).toMatchObject({
      status: '部分缺失', missing: ['electron/database/sqlQueryBudget.testSupport.ts'], count: '已登记债务 2 条'
    });
    expect(guards['必填写入类别（runWriter kind）'].status).toBe('未落地');
    expect(guards['手机端慢操作诊断记录'].status).toBe('未落地');

    repo.commit('wire scan', {
      'scripts/quality/quality-gate-fast-static-guards.sh': 'node scripts/quality/unstable-reference-heavy-work.mjs\n',
      'src/shared/companionWriteKind.ts': 'export type CompanionWriteKind = "business";\n'
    });
    const wired = Object.fromEntries(inspectGuards(repo.root).map((guard) => [guard.label, guard]));
    expect(wired['引用不稳定扫描'].wiring).toBe('已接入：scripts/quality/quality-gate-fast-static-guards.sh');
    expect(wired['必填写入类别（runWriter kind）']).toMatchObject({ status: '已落地', files: ['src/shared/companionWriteKind.ts'] });
  });

  it('renders both tables and says nothing was run', () => {
    seedCheckout();
    const markdown = runInventory(['--repo', repo.root, '--artifacts', path.join(repo.root, 'artifacts')]);
    expect(markdown).toContain('本次未执行任何维护项');
    expect(markdown).toContain('| 固定性能 | `npm run benchmark:desktop`（package.json 无此脚本） |');
    expect(markdown).toContain('| 机制守卫 | 状态 | 文件 | 质检接入 | 备注 |');
  });
});
