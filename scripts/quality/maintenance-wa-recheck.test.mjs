// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import { findRecheckCandidates, renderRecheckMarkdown } from './maintenance-wa-recheck.mjs';
import { parseTableRows, resolveRowFiles } from './maintenance-wa-table.mjs';
import { createTestRepo } from './maintenance-test-repo.test-support.mjs';

let repo;
afterEach(() => repo?.cleanup());

function table(rows) {
  return ['# 表', '', '| ID | 稳定对象与位置 | 标记依据 | 状态 | 证据 | 重查条件 |', '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((cells) => `| ${cells.join(' | ')} |`), '', '| 动作 | 宿主 |', '| 评分 | 手机 |'].join('\n');
}

describe('work-amplification recheck candidates', () => {
  it('lists rows whose cited files changed after their newest evidence commit', () => {
    repo = createTestRepo();
    const first = repo.commit('base', { 'src/a/flowRefresh.ts': '0', 'src/b/order.ts': '0', 'src/c/other.ts': '0' });
    const fix = repo.commit('fix order', { 'src/b/order.ts': '1' });
    repo.commit('touch flow', { 'src/a/flowRefresh.ts': '1' });
    const markdown = table([
      ['WA-001', 'Flow 刷新 `flowRefresh.ts`', 'B', '已修复', `修复 ${first.slice(0, 10)}`, '刷新变化时重查'],
      ['WA-002', '排序 src/b/order.ts', 'A', '已修复', `历史 ${first.slice(0, 9)}，修复 ${fix.slice(0, 9)}`, '—'],
      ['WA-003', '无路径的对象', 'B', '待核实', `${fix.slice(0, 9)}`, '—'],
      ['WA-004', '`other.ts` 未登记提交', 'B', '待核实', '只读核读', '—']
    ]);
    const result = findRecheckCandidates({ cwd: repo.root, markdown });

    expect(result.rows).toBe(4);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: 'WA-001', evidence: first.slice(0, 10), changed: ['src/a/flowRefresh.ts'], status: '已修复'
    });
    expect(result.candidates[0].commits[0]).toMatch(/ touch flow$/u);
    expect(result.unchanged).toEqual(['WA-002']);
    expect(result.noFiles).toEqual(['WA-003']);
    expect(result.noEvidence).toEqual(['WA-004']);

    const markdownOut = renderRecheckMarkdown(result);
    expect(markdownOut).toContain('待重查候选 1，证据后未变 1，无可解析路径 1，无可用证据提交 1（只输出，未改表）');
    expect(markdownOut).toContain('| WA-001 |');
  });

  it('locates rows that cite only identifiers through the few production files defining them', () => {
    repo = createTestRepo();
    const base = repo.commit('base', {
      'src/flow/receipts.ts': 'export function mergeDailyFlowReceiptNodes() {}\n',
      'src/flow/receipts.test.ts': 'mergeDailyFlowReceiptNodes();\n',
      ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`src/m${i}.ts`, 'const nodesByIdMap = 1;\n']))
    });
    repo.commit('change receipts', { 'src/flow/receipts.ts': 'export function mergeDailyFlowReceiptNodes() { return 1; }\n' });
    const markdown = table([['WA-020', '回执合并：mergeDailyFlowReceiptNodes→nodesByIdMap', 'B', '有条件合理', base.slice(0, 9), '—']]);
    const [candidate] = findRecheckCandidates({ cwd: repo.root, markdown }).candidates;
    expect(candidate).toMatchObject({ id: 'WA-020', identifiers: ['mergeDailyFlowReceiptNodes'], files: ['src/flow/receipts.ts'] });
    expect(renderRecheckMarkdown({ ...findRecheckCandidates({ cwd: repo.root, markdown }) }))
      .toContain('（含经标识符定位：mergeDailyFlowReceiptNodes）');
  });

  it('accepts a commit-note number as the evidence commit', () => {
    repo = createTestRepo();
    repo.commit('000100 base', { 'src/a.ts': '0' });
    repo.commit('000101 fix a', { 'src/a.ts': '1' });
    repo.commit('000102 touch a', { 'src/a.ts': '2' });
    const markdown = table([['WA-030', '`a.ts`', 'B', '已修复', 'T578 修复（000101）', '—']]);
    const result = findRecheckCandidates({ cwd: repo.root, markdown });
    expect(result.candidates[0]).toMatchObject({ id: 'WA-030', evidence: '000101' });
    expect(result.candidates[0].commits).toHaveLength(1);
    expect(result.candidates[0].commits[0]).toMatch(/000102 touch a$/u);
  });

  it('resolves bare file names to every tracked match and keeps unknown names unresolved', () => {
    const tracked = ['src/a/store.ts', 'src/b/store.ts', 'electron/x.test.ts'];
    expect(resolveRowFiles('见 store.ts、electron/x.test.ts 与 gone.tsx', tracked)).toEqual({
      files: ['electron/x.test.ts', 'src/a/store.ts', 'src/b/store.ts'], unresolved: ['gone.tsx']
    });
  });

  it('parses only WA rows and keeps escaped pipes inside cells', () => {
    const rows = parseTableRows(table([['WA-010', 'a \\| b', 'B', '待重查', 'x', 'y']]));
    expect(rows).toEqual([{ id: 'WA-010', object: 'a \\| b', status: '待重查', text: 'a \\| b | B | 待重查 | x | y' }]);
  });
});
