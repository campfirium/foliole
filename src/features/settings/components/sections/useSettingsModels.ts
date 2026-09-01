import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef, useState } from 'react';

import type { NativeAssistantFailureCategory } from '../../../../../lib/platform/nativeAssistantContract';
import {
  NATIVE_ASSISTANT_CODEX_MODEL_ID,
  type NativeAssistantCustomModel,
  type NativeAssistantModelSettings
} from '../../../../../lib/platform/nativeAssistantModelSettingsContract';
import {
  deleteAssistantModel,
  loadAssistantModelSettings,
  saveAssistantModelDraft,
  selectAssistantModel,
  testAssistantModel
} from '../../../../shared/platform/assistantRuntime';

import {
  readCodexConnection,
  signInCodex,
  type SettingsCodexConnectionState
} from './settingsCodexConnection';

export type { SettingsCodexConnectionState } from './settingsCodexConnection';

export interface SettingsModelDraft {
  apiKey: string;
  endpoint: string;
  hasApiKey: boolean;
  id: string;
  model: string;
  persisted: boolean;
  result: 'not_tested' | 'ready' | NativeAssistantFailureCategory | null;
  selectable: boolean;
  testing: boolean;
}

const EMPTY_SETTINGS: NativeAssistantModelSettings = {
  models: [], selected_model_id: NATIVE_ASSISTANT_CODEX_MODEL_ID
};

type ModelState = {
  saveQueue: MutableRefObject<Promise<void>>;
  setBusyId: (value: string | null) => void;
  setDrafts: Dispatch<SetStateAction<SettingsModelDraft[]>>;
  setSettings: (value: NativeAssistantModelSettings) => void;
};

export function useSettingsModels() {
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [drafts, setDrafts] = useState<SettingsModelDraft[]>(() => [createEmptyDraft()]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [codexConnection, setCodexConnection] = useState<SettingsCodexConnectionState>('checking');
  const [codexSigningIn, setCodexSigningIn] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  useInitialSettings(setSettings, setDrafts, setLoadFailed, setCodexConnection);
  const state = { saveQueue, setBusyId, setDrafts, setSettings };
  return {
    ...createModelActions(state),
    busyId,
    codexConnection,
    codexSigningIn,
    drafts,
    loadFailed,
    settings,
    signInCodex: () => signInCodex(setCodexConnection, setCodexSigningIn)
  };
}

function useInitialSettings(
  setSettings: (value: NativeAssistantModelSettings) => void,
  setDrafts: (value: SettingsModelDraft[]) => void,
  setLoadFailed: (value: boolean) => void,
  setCodexConnection: (value: SettingsCodexConnectionState) => void
) {
  useEffect(() => {
    let active = true;
    void loadInitialSettings({ active: () => active, setCodexConnection, setDrafts, setLoadFailed, setSettings });
    return () => { active = false; };
  }, [setCodexConnection, setDrafts, setLoadFailed, setSettings]);
}

async function loadInitialSettings(input: {
  active: () => boolean;
  setCodexConnection: (value: SettingsCodexConnectionState) => void;
  setDrafts: (value: SettingsModelDraft[]) => void;
  setLoadFailed: (value: boolean) => void;
  setSettings: (value: NativeAssistantModelSettings) => void;
}) {
  try {
    const value = await loadAssistantModelSettings();
    if (input.active() && value) {
      input.setSettings(value);
      input.setDrafts([...value.models.map(toDraft), createEmptyDraft()]);
    }
  } catch {
    if (input.active()) input.setLoadFailed(true);
  }
  const connection = await readCodexConnection();
  if (input.active()) input.setCodexConnection(connection);
}

function createModelActions(state: ModelState) {
  return {
    remove: (draft: SettingsModelDraft) => removeDraft(state, draft),
    select: (id: string) => selectModel(state, id),
    test: (draft: SettingsModelDraft) => testDraft(state, draft),
    update: (draft: SettingsModelDraft, patch: Partial<Pick<SettingsModelDraft, 'apiKey' | 'endpoint' | 'model'>>) => {
      const next = { ...draft, ...patch, result: null };
      updateDraft(state.setDrafts, draft.id, next);
      enqueueDraftSave(state, next, 'apiKey' in patch);
    }
  };
}

function createEmptyDraft(): SettingsModelDraft {
  return {
    apiKey: '', endpoint: '', hasApiKey: false, id: crypto.randomUUID(),
    model: '', persisted: false, result: null, selectable: false, testing: false
  };
}

async function testDraft(state: ModelState, draft: SettingsModelDraft) {
  updateDraft(state.setDrafts, draft.id, { testing: true, result: null });
  try {
    await state.saveQueue.current;
    const result = await testAssistantModel({
      endpoint: draft.endpoint, model: draft.model,
      id: draft.id,
      ...(draft.apiKey.trim() ? { api_key: draft.apiKey.trim() } : {})
    });
    if (!result) throw new Error('models_unavailable');
    state.setSettings(result.settings);
    const saved = result.settings.models.find((model) => model.id === draft.id)
      ?? result.settings.models.at(-1);
    const testResult = result.state === 'ready' ? 'ready' : result.failure.category;
    if (saved && (result.state === 'ready' || !draft.persisted)) {
      replaceSavedDraft(state.setDrafts, draft.id, saved, testResult);
    }
    else updateDraft(state.setDrafts, draft.id, { result: testResult });
  } catch {
    updateDraft(state.setDrafts, draft.id, { result: 'internal_error' });
  } finally {
    updateDraft(state.setDrafts, draft.id, { testing: false });
  }
}

async function selectModel(state: ModelState, id: string) {
  state.setBusyId(id);
  try {
    await state.saveQueue.current;
    const next = await selectAssistantModel(id);
    if (next) state.setSettings(next);
  } finally {
    state.setBusyId(null);
  }
}

async function removeDraft(state: ModelState, draft: SettingsModelDraft) {
  const hasDraftValues = Boolean(draft.apiKey || draft.endpoint || draft.model);
  if (!draft.persisted && !hasDraftValues) {
    state.setDrafts((current) => current.filter((item) => item.id !== draft.id));
    return;
  }
  state.setBusyId(draft.id);
  try {
    await state.saveQueue.current;
    const next = await deleteAssistantModel(draft.id);
    if (next) {
      state.setSettings(next);
      state.setDrafts((current) => current.filter((item) => item.id !== draft.id));
    }
  } finally {
    state.setBusyId(null);
  }
}

function enqueueDraftSave(state: ModelState, draft: SettingsModelDraft, includeApiKey: boolean) {
  state.saveQueue.current = state.saveQueue.current.catch(() => undefined).then(async () => {
    const settings = await saveAssistantModelDraft({
      endpoint: draft.endpoint,
      id: draft.id,
      model: draft.model,
      ...(includeApiKey ? { api_key: draft.apiKey } : {})
    });
    if (!settings) return;
    state.setSettings(settings);
    const saved = settings.models.find((model) => model.id === draft.id);
    if (saved) markDraftSaved(state.setDrafts, saved);
  });
}

function markDraftSaved(setDrafts: ModelState['setDrafts'], saved: NativeAssistantCustomModel) {
  setDrafts((current) => current.map((draft) => draft.id === saved.id ? {
      ...draft, hasApiKey: saved.has_api_key, persisted: true,
      result: 'not_tested' as const, selectable: false
    } : draft));
}

function updateDraft(
  setDrafts: ModelState['setDrafts'],
  id: string,
  patch: Partial<SettingsModelDraft>
) {
  setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
}

function replaceSavedDraft(
  setDrafts: ModelState['setDrafts'],
  id: string,
  model: NativeAssistantCustomModel,
  result: SettingsModelDraft['result']
) {
  setDrafts((current) => {
    const next = current.map((item) => item.id === id
      ? { ...toDraft(model), result }
      : item);
    return next.some((item) => !item.persisted) ? next : [...next, createEmptyDraft()];
  });
}

function toDraft(model: NativeAssistantCustomModel): SettingsModelDraft {
  return {
    apiKey: '', endpoint: model.endpoint, hasApiKey: model.has_api_key, id: model.id,
    model: model.model, persisted: true,
    result: model.state === 'configured' ? null : 'not_tested',
    selectable: model.state === 'configured', testing: false
  };
}
