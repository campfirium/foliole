// @vitest-environment node
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { extractContext, findRemediationCandidates, runCli } from './maintenance-remediation-candidates.mjs';
import { createTestRepo } from './maintenance-test-repo.test-support.mjs';

let repo;
afterEach(() => repo?.cleanup());

function body(subject, context) {
  return `${subject}\n\ncontext: ${context}\nchange: did it.\nintent: keep it fast.`;
}

function seedHistory() {
  repo = createTestRepo();
  repo.commit('000001 base', { 'src/a.ts': '0' });
  repo.tag('v0.1.0');
  repo.commit(body('000002 stop reloading the whole library on every grade', 'each grade reread every node.'),
    { 'src/review/grade.ts': '1' });
  repo.commit(body('000003 split the slow sync test', 'the test hit the timeout.'), { 'src/sync/sync.test.ts': '1' });
  repo.commit(body('000004 fix hosted full quality on Windows', 'runner image changed.'), { 'scripts/quality/x.mjs': '1' });
  repo.commit(body('000005 document the batch import limits', 'readers asked.'), { 'docs/import.md': '1' });
  repo.commit(body('000006 rename the settings label', 'the label was unclear.'), { 'src/settings.ts': '1' });
  repo.commit('000007 avoid a native bridge call per attachment', { 'src/native/attachments.ts': '1' });
}

describe('remediation review candidates', () => {
  it('keeps keyword-matched product fixes and drops test, hosted and docs commits', () => {
    seedHistory();
    const result = findRemediationCandidates({ cwd: repo.root, from: 'v0.1.0', to: 'dev' });
    expect(result.total).toBe(6);
    expect(result.matched).toBe(5);
    expect(result.excluded).toEqual({ 'hosted/文档/fixture 标题': 1, '只改测试、文档或质检脚本': 2 });
    expect(result.candidates.map((candidate) => candidate.subject)).toEqual([
      '000007 avoid a native bridge call per attachment',
      '000002 stop reloading the whole library on every grade'
    ]);
    expect(result.candidates[1]).toMatchObject({ context: 'each grade reread every node.' });
    expect(result.candidates[1].keywords).toEqual(expect.arrayContaining(['whole', 'every', 'reload']));
    expect(result.candidates[0].context).toBeNull();
  });

  it('starts at the last remediation review in the ledger when no range is given', () => {
    seedHistory();
    const ledgerPath = path.join(repo.root, 'ledger.json');
    repo.write('ledger.json', JSON.stringify({
      formatVersion: 1, runs: [{ item: 'remediation-review', release: 'v0.1.0', date: '2026-11-01' }]
    }));
    const markdown = runCli(['--repo', repo.root, '--ledger', ledgerPath]);
    expect(markdown).toContain('区间 `v0.1.0..dev`：提交 6 个，标题命中 5 个');
    expect(markdown).toContain('  - context: each grade reread every node.');
    expect(markdown).toContain('（无 context 段）');
  });

  it('reads a multi-line context paragraph up to the change line', () => {
    expect(extractContext('subject\n\ncontext: first line\ncontinues here.\nchange: x\nintent: y')).toBe(
      'first line continues here.'
    );
  });
});
