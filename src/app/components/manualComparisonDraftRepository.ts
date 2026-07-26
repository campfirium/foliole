import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { loadRuntimeAppSettingsState, saveRuntimeAppSettingsState } from '../../shared/platform/appSettingsState';

const MANUAL_COMPARISON_DRAFTS_KEY = APP_SETTINGS_STORAGE_KEYS.manualComparisonDrafts;
const MAX_DRAFTS = 20;
const MAX_DRAFT_LENGTH = 200_000;

interface ManualComparisonDraftRecord {
  content: string;
  updatedAt: string;
}

type ManualComparisonDrafts = Record<string, ManualComparisonDraftRecord>;
let draftCache: ManualComparisonDrafts = {};
let saveQueue = Promise.resolve();

function isDraftRecord(value: unknown): value is ManualComparisonDraftRecord {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as ManualComparisonDraftRecord).content === 'string' &&
    typeof (value as ManualComparisonDraftRecord).updatedAt === 'string'
  );
}

function parseManualComparisonDrafts(raw: string | undefined): ManualComparisonDrafts {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, ManualComparisonDraftRecord] =>
        typeof entry[0] === 'string' && isDraftRecord(entry[1])
      )
    );
  } catch {
    return {};
  }
}

function trimDrafts(drafts: ManualComparisonDrafts): ManualComparisonDrafts {
  return Object.fromEntries(
    Object.entries(drafts)
      .sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_DRAFTS)
  );
}

async function loadDraftMap() {
  draftCache = {
    ...parseManualComparisonDrafts((await loadRuntimeAppSettingsState())?.[MANUAL_COMPARISON_DRAFTS_KEY]),
    ...draftCache
  };
  return draftCache;
}

async function saveDraftMap(drafts: ManualComparisonDrafts) {
  const settings = await loadRuntimeAppSettingsState();
  await saveRuntimeAppSettingsState({
    ...(settings ?? {}),
    [MANUAL_COMPARISON_DRAFTS_KEY]: JSON.stringify(trimDrafts(drafts))
  });
}

export async function loadManualComparisonDraft(nodeId: string | null) {
  if (!nodeId) return '';
  if (draftCache[nodeId]) return draftCache[nodeId].content;
  return (await loadDraftMap())[nodeId]?.content ?? '';
}

export async function saveManualComparisonDraft(nodeId: string | null, content: string) {
  if (!nodeId) return;
  if (!content.trim()) {
    delete draftCache[nodeId];
  } else {
    draftCache[nodeId] = { content: content.slice(0, MAX_DRAFT_LENGTH), updatedAt: new Date().toISOString() };
  }
  const nextSave = saveQueue.catch(() => undefined).then(async () => {
    const drafts = await loadDraftMap();
    if (!content.trim()) {
      delete drafts[nodeId];
    } else {
      drafts[nodeId] = {
        content: content.slice(0, MAX_DRAFT_LENGTH),
        updatedAt: new Date().toISOString()
      };
    }
    draftCache = trimDrafts(drafts);
    await saveDraftMap(draftCache);
  });
  saveQueue = nextSave.catch(() => undefined);
  await nextSave;
}

export async function clearManualComparisonDraft(nodeId: string | null) {
  await saveManualComparisonDraft(nodeId, '');
}
