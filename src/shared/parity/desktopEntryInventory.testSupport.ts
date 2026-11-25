export type MobileHandling = 'entry' | 'desktopOnly' | 'later' | 'unreviewed';

export interface DesktopEntryRecord {
  id: string;
  mobile: MobileHandling;
  mobileEntry?: string;
  reason?: string;
  task?: string;
  capmapRef?: string;
}

const REQUIRED_FIELD: Record<Exclude<MobileHandling, 'unreviewed'>, 'mobileEntry' | 'reason' | 'task'> = {
  entry: 'mobileEntry',
  desktopOnly: 'reason',
  later: 'task'
};
const TASK_ID = /^[TSC]\d+(?:-\d+)*$/u;

export const DECLARE_HINT = [
  '在 src/shared/parity/desktopEntryInventory.json 为每个新入口加一行并声明手机端怎么处理：',
  '  {"id":"…","mobile":"entry","mobileEntry":"手机上的入口路径"}',
  '  {"id":"…","mobile":"desktopOnly","reason":"只在桌面的理由"}',
  '  {"id":"…","mobile":"later","task":"已登记的任务号"}'
].join('\n');

function checkRecord(record: DesktopEntryRecord, baseline: Set<string>): string[] {
  if (record.mobile === 'unreviewed') {
    return baseline.has(record.id) ? [] : [`${record.id}: 新入口不能标 unreviewed`];
  }
  const field = REQUIRED_FIELD[record.mobile];
  if (!field) return [`${record.id}: mobile 只能是 entry / desktopOnly / later`];
  const value = record[field]?.trim();
  if (!value) return [`${record.id}: mobile=${record.mobile} 需要填写 ${field}`];
  if (field === 'task' && !TASK_ID.test(value)) return [`${record.id}: task 需要是任务号`];
  return [];
}

export function checkDesktopEntryInventory(
  scannedIds: string[],
  records: DesktopEntryRecord[],
  unreviewedBaseline: string[]
) {
  const baseline = new Set(unreviewedBaseline);
  const scanned = new Set(scannedIds);
  const recorded = new Set<string>();
  const duplicates: string[] = [];
  for (const record of records) {
    if (recorded.has(record.id)) duplicates.push(record.id);
    recorded.add(record.id);
  }
  const unreviewed = new Set(records.filter((record) => record.mobile === 'unreviewed').map((record) => record.id));
  return {
    undeclared: scannedIds.filter((id) => !recorded.has(id)),
    stale: records.map((record) => record.id).filter((id) => !scanned.has(id)),
    duplicates,
    invalid: records.flatMap((record) => checkRecord(record, baseline)),
    // The baseline only shrinks: reviewed or removed entries must leave it too.
    staleBaseline: unreviewedBaseline.filter((id) => !unreviewed.has(id))
  };
}
