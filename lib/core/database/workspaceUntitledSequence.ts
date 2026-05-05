import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface WorkspaceMetaRow extends DatabaseRow {
  value: string;
}

const UNTITLED_TITLE_PATTERN = /^Untitled(?: (\d+))?$/;
const UNTITLED_SEQUENCE_META_KEY = 'untitled_sequence_by_parent';
const ROOT_PARENT_KEY = '__root__';

function toParentKey(parentNodeId: string | null) {
  return parentNodeId ?? ROOT_PARENT_KEY;
}

function parseSequenceMap(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const nextSequenceByParent: Record<string, number> = {};
    for (const [key, sequence] of Object.entries(parsed)) {
      if (typeof sequence !== 'number' || !Number.isFinite(sequence) || sequence < 0) {
        continue;
      }
      nextSequenceByParent[key] = sequence;
    }
    return nextSequenceByParent;
  } catch {
    return {};
  }
}

function toNextSequence(title: string) {
  const match = title.trim().match(UNTITLED_TITLE_PATTERN);
  if (!match) {
    return null;
  }
  return match[1] ? Number.parseInt(match[1], 10) + 1 : 1;
}

export function loadUntitledSequenceByParent(driver: DatabaseDriver) {
  const row = driver.queryOne<WorkspaceMetaRow>(
    'SELECT value FROM workspace_meta WHERE key = ?',
    [UNTITLED_SEQUENCE_META_KEY]
  );
  return row ? parseSequenceMap(row.value) : {};
}

export function bumpUntitledSequenceByParent(
  driver: DatabaseDriver,
  input: { parentNodeId: string | null; title: string; updatedAt: string }
) {
  const nextSequence = toNextSequence(input.title);
  if (nextSequence === null) {
    return;
  }
  const parentKey = toParentKey(input.parentNodeId);
  const currentSequenceByParent = loadUntitledSequenceByParent(driver);
  const updatedSequenceByParent = {
    ...currentSequenceByParent,
    [parentKey]: Math.max(currentSequenceByParent[parentKey] ?? 0, nextSequence)
  };
  driver.execute(
    `INSERT INTO workspace_meta (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [UNTITLED_SEQUENCE_META_KEY, JSON.stringify(updatedSequenceByParent), input.updatedAt]
  );
}
