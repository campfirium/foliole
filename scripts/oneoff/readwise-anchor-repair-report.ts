import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AnchorRepairPlan } from './readwise-anchor-repair-types.js';

export async function writeAnchorRepairReceipts(input: {
  backupPath?: string;
  dbPath: string;
  mode: 'apply' | 'dry-run';
  outputDir: string;
  plan: AnchorRepairPlan;
  result?: unknown;
  sourceReceiptPath: string;
}) {
  await fs.mkdir(input.outputDir, { recursive: true });
  const stamp = input.plan.generatedAt.replaceAll(':', '-');
  const base = `t175-readwise-anchor-repair-${input.mode}-${stamp}`;
  const jsonPath = path.join(input.outputDir, `${base}.json`);
  const markdownPath = path.join(input.outputDir, `${base}.md`);
  const payload = { backupPath: input.backupPath ?? null, databasePath: input.dbPath, mode: input.mode,
    plan: input.plan, result: input.result ?? null, sourceReceiptPath: input.sourceReceiptPath };
  const lines = [
    '# T175 Readwise anchor repair receipt', '', `- Mode: ${input.mode}`, `- Database: ${input.dbPath}`,
    `- Source receipt: ${input.sourceReceiptPath}`, `- Source plan hash: ${input.plan.sourcePlanHash}`,
    `- Plan hash: ${input.plan.planHash}`, `- Relocate: ${input.plan.apply.length}`,
    `- Mark unmapped: ${input.plan.unmap.length}`, `- No repair: ${input.plan.noRepair.length}`,
    `- Manual review: ${input.plan.manualReview.length}`, `- Backup: ${input.backupPath ?? 'n/a'}`,
    '', '## Relocate', '',
    ...input.plan.apply.map((item) => `- ${item.parentId} / ${item.childId} | ${item.oldRanges[0]?.from} -> ${item.newRanges?.[0]?.from}`),
    '', '## Mark unmapped', '',
    ...input.plan.unmap.map((item) => `- ${item.parentId} / ${item.childId} | ${item.nextStatus}`),
    '', '## Manual review', '',
    ...input.plan.manualReview.map((item) => `- ${item.parentId} / ${item.childId} | ${item.reason} | ${item.title}`), ''
  ];
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8'),
    fs.writeFile(markdownPath, `${lines.join('\n')}\n`, 'utf8')
  ]);
  return { jsonPath, markdownPath };
}
