// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { emptyLedger } from './maintenance-ledger.mjs';
import { planReleaseMaintenance } from './maintenance-release-decision.mjs';
import { runCli } from './maintenance-release-plan.mjs';
import { createTestRepo } from './maintenance-test-repo.test-support.mjs';

let repo;
afterEach(() => repo?.cleanup());

function ledgerWith(runs) {
  return { ...emptyLedger(), runs };
}

function byItem(plan) {
  return Object.fromEntries(plan.items.map((entry) => [entry.item, entry]));
}

function allItemsRanAt(release, date) {
  return ['remediation-review', 'log-review', 'unstable-reference-scan', 'upgrade-recovery', 'system-integration',
    'database-audit', 'performance-quarterly', 'main-thread-blocking'].map((item) => ({ item, release, date }));
}

function seedRelease() {
  repo = createTestRepo();
  repo.commit('base', { 'src/app.ts': 'a', 'docs/readme.md': 'a' });
  repo.tag('v0.1.0');
}

describe('release maintenance plan', () => {
  it('runs every item when the ledger has no record, upgrade recovery at quarterly', () => {
    seedRelease();
    const plan = byItem(planReleaseMaintenance({ cwd: repo.root, ledger: emptyLedger(), today: '2026-11-02' }));
    expect(Object.values(plan).every((entry) => entry.run)).toBe(true);
    expect(plan['system-integration'].reasons).toContain('台账无记录，视为从未执行');
    expect(plan['upgrade-recovery'].mode).toBe('quarterly');
  });

  it('skips path-conditioned items when only docs and tests changed since their last run', () => {
    seedRelease();
    repo.commit('docs and tests', {
      'docs/readme.md': 'b', 'src/app.test.ts': 'b', 'electron/db.testSupport.ts': 'b',
      'electron/database/numberedMigrationTestSupport.ts': 'b'
    });
    const plan = byItem(planReleaseMaintenance({
      cwd: repo.root, ledger: ledgerWith(allItemsRanAt('v0.1.0', '2026-11-01')), today: '2026-11-05'
    }));
    for (const item of ['system-integration', 'database-audit', 'performance-quarterly', 'main-thread-blocking']) {
      expect(plan[item].run, item).toBe(false);
    }
    for (const item of ['remediation-review', 'log-review', 'unstable-reference-scan', 'upgrade-recovery']) {
      expect(plan[item].run, item).toBe(true);
    }
    expect(plan['upgrade-recovery'].mode).toBe('release');
    expect(plan['system-integration'].changedCount).toBe(4);
    expect(plan['system-integration'].productionCount).toBe(0);
  });

  it('triggers the items whose paths changed and escalates upgrade recovery on migrations', () => {
    seedRelease();
    repo.commit('migration', { 'electron/database/nodeMigration.ts': 'b' });
    const plan = byItem(planReleaseMaintenance({
      cwd: repo.root, ledger: ledgerWith(allItemsRanAt('v0.1.0', '2026-11-01')), today: '2026-11-05'
    }));
    expect(plan['system-integration'].run).toBe(true);
    expect(plan['database-audit'].triggers).toEqual(['electron/database/nodeMigration.ts']);
    expect(plan['main-thread-blocking'].run).toBe(true);
    expect(plan['performance-quarterly'].run).toBe(false);
    expect(plan['upgrade-recovery'].mode).toBe('quarterly');
  });

  it('measures each item from its own last run, not from the latest release', () => {
    seedRelease();
    repo.commit('product change', { 'src/features/list/view.ts': 'b' });
    repo.tag('v0.2.0');
    repo.commit('docs only', { 'docs/readme.md': 'c' });
    const ledger = ledgerWith([
      ...allItemsRanAt('v0.2.0', '2026-11-02').filter((run) => run.item !== 'performance-quarterly'),
      { item: 'performance-quarterly', release: 'v0.1.0', date: '2026-11-01' }
    ]);
    const plan = byItem(planReleaseMaintenance({ cwd: repo.root, ledger, today: '2026-11-05' }));
    expect(plan['performance-quarterly'].run).toBe(true);
    expect(plan['performance-quarterly'].range).toBe('v0.1.0');
    expect(plan['system-integration'].run).toBe(false);
  });

  it('forces a skipped item on the third release after its last run or after four weeks', () => {
    seedRelease();
    repo.commit('docs', { 'docs/readme.md': 'b' });
    repo.tag('v0.2.0');
    repo.commit('docs again', { 'docs/readme.md': 'c' });
    repo.tag('v0.3.0');
    const ledger = ledgerWith([{ item: 'database-audit', release: 'v0.1.0', date: '2026-11-01' },
      { item: 'performance-quarterly', release: 'v0.3.0', date: '2026-10-01' }]);
    const plan = byItem(planReleaseMaintenance({ cwd: repo.root, ledger, today: '2026-11-03' }));
    expect(plan['database-audit'].run).toBe(true);
    expect(plan['database-audit'].reasons.join()).toContain('第 3 次发布');
    expect(plan['performance-quarterly'].run).toBe(true);
    expect(plan['performance-quarterly'].reasons.join()).toContain('距上次执行 33 天');
  });

  it('records runs to the ledger and renders the table from it', () => {
    seedRelease();
    const ledgerPath = path.join(repo.root, 'ledger.json');
    const recorded = runCli(['--repo', repo.root, '--ledger', ledgerPath, '--record', 'all', '--release', 'v0.1.0',
      '--date', '2026-11-01']);
    expect(recorded).toContain('recorded 8 run(s)');
    expect(JSON.parse(readFileSync(ledgerPath, 'utf8')).runs[0]).toMatchObject({ item: 'remediation-review', release: 'v0.1.0' });
    const markdown = runCli(['--repo', repo.root, '--ledger', ledgerPath, '--today', '2026-11-02']);
    expect(markdown).toContain('| 项目 | 上次执行 | 区间起点 | 区间变更 | 结论 | 理由 |');
    expect(markdown).toMatch(/\| 系统集成 all \| v0\.1\.0（2026-11-01，1 天前） \| v0\.1\.0 \| 0 个文件.* \| 跳过 \|/u);
    expect(() => runCli(['--repo', repo.root, '--ledger', ledgerPath, '--record', 'bogus', '--release', 'v0.1.0']))
      .toThrow('unknown item: bogus');
  });
});
