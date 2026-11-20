import { readFileSync } from 'node:fs';
import path from 'node:path';

export const sandboxAuditEndpoint = '/__foliole_preview/menu-audit';
const auditFile = '.lab/atlas/5audit/261120-mobile-menu-inventory.md';

export function parseCompanionSandboxAuditRows(markdown: string): string[][] {
  let inventory = false;
  const entries: string[][] = [];
  for (const line of markdown.split(/\r?\n/u)) {
    if (!line.startsWith('|')) { inventory = false; continue; }
    const cells = line.split(/(?<!\\)\|/u).slice(1, -1).map(cell => cell.trim().replace(/\\\|/gu, '|'));
    if (cells[0] === '页面 / 元素') { inventory = true; continue; }
    if (inventory && cells.length === 5 && cells[0] && !/^:?-+:?$/u.test(cells[0])) entries.push(cells);
  }
  return entries;
}

export function readCompanionSandboxAuditRows(projectRoot: string) {
  try {
    return parseCompanionSandboxAuditRows(readFileSync(path.join(projectRoot, auditFile), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
