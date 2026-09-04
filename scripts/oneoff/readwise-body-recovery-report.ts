import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { RecoveryPlan } from './readwise-body-recovery-selection.js';

export async function writeRecoveryReceipts(input: {
  backupPath?: string;
  dbPath: string;
  mode: 'apply' | 'dry-run';
  outputDir: string;
  plan: RecoveryPlan;
  result?: unknown;
}) {
  await fs.mkdir(input.outputDir, { recursive: true });
  const stamp = input.plan.generatedAt.replaceAll(':', '-');
  const base = `t175-readwise-body-recovery-${input.mode}-${stamp}`;
  const jsonPath = path.join(input.outputDir, `${base}.json`);
  const markdownPath = path.join(input.outputDir, `${base}.md`);
  const payload = { backupPath: input.backupPath ?? null, databasePath: input.dbPath,
    mode: input.mode, plan: input.plan, result: input.result ?? null };
  const lines = [
    '# T175 Readwise body recovery receipt', '', `- Mode: ${input.mode}`, `- Database: ${input.dbPath}`,
    `- Plan hash: ${input.plan.planHash}`, `- Apply candidates: ${input.plan.apply.length}`,
    `- No repair: ${input.plan.noRepair.length}`, `- Manual review: ${input.plan.manualReview.length}`,
    `- Backup: ${input.backupPath ?? 'n/a'}`, '', '## Apply candidates', '',
    ...input.plan.apply.map((item) => `- ${item.nodeId} | ${item.currentBytes} -> ${item.recoveryBytes} bytes | ${item.recoveryVersionId} | anchors=${item.anchors.length}`),
    '', '## Manual review', '',
    ...input.plan.manualReview.map((item) => `- ${item.nodeId} | ${item.reason} | ${item.title}`), ''
  ];
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8'),
    fs.writeFile(markdownPath, `${lines.join('\n')}\n`, 'utf8')
  ]);
  return { jsonPath, markdownPath };
}
