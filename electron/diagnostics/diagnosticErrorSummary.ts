import { redactExportedDiagnosticText } from './diagnosticExportRedactor.js';

export const MAX_ERROR_SUMMARY_CLASSES = 10;
export const MAX_ERROR_SUMMARY_CHARS = 1500;

export interface RuntimeErrorRecordInput {
  at: string;
  detail?: string;
  file?: string;
  level: string;
  name: string;
  payload?: unknown;
  source?: string;
}

interface RuntimeErrorClass {
  count: number;
  error: string;
  last: RuntimeErrorRecordInput;
  order: number;
}

function readErrorText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return '';
  const { code, message, name } = error as { code?: unknown; message?: unknown; name?: unknown };
  const label = [name, code].filter((part) => typeof part === 'string' && part).join(' ');
  const text = redactExportedDiagnosticText(typeof message === 'string' ? message : '');
  return [label, text].filter(Boolean).join(': ');
}

function groupRecords(records: RuntimeErrorRecordInput[]) {
  const classes = new Map<string, RuntimeErrorClass>();
  records.forEach((record, order) => {
    const error = readErrorText(record.payload);
    const key = [record.level, record.source, record.name, record.detail, error].join('\u0000');
    const existing = classes.get(key);
    if (existing) {
      existing.count += 1;
      existing.last = record;
      existing.order = order;
    } else {
      classes.set(key, { count: 1, error, last: record, order });
    }
  });
  return [...classes.values()];
}

function formatClass(entry: RuntimeErrorClass) {
  const { last } = entry;
  const source = last.source ? ` ${last.source}` : '';
  const detail = last.detail ? ` ${last.detail}` : '';
  const error = entry.error ? ` error=${JSON.stringify(entry.error)}` : '';
  const count = entry.count > 1 ? ` ×${entry.count}` : '';
  const file = last.file ? ` [${last.file}]` : '';
  return `- ${last.at}${source}: ${last.name}${detail}${error}${count}${file}`;
}

// Errors outrank warnings, newer outranks older; the kept lines are shown oldest first.
export function summarizeRuntimeErrors(records: RuntimeErrorRecordInput[]) {
  const ranked = groupRecords(records).sort((left, right) =>
    Number(right.last.level === 'error') - Number(left.last.level === 'error') || right.order - left.order);
  const kept: Array<{ line: string; order: number }> = [];
  let used = 0;
  for (const entry of ranked) {
    if (kept.length >= MAX_ERROR_SUMMARY_CLASSES) break;
    const line = formatClass(entry);
    if (used + line.length + 1 > MAX_ERROR_SUMMARY_CHARS) continue;
    kept.push({ line, order: entry.order });
    used += line.length + 1;
  }
  return kept.sort((left, right) => left.order - right.order).map((entry) => entry.line);
}
