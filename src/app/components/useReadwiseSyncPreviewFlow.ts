import { useState } from 'react';

import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseSyncPreviewResult } from '../../../lib/platform/nativeImportContract';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import type { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

export type ReadwiseSyncIntent = 'enable' | 'sync';
type ReadwiseSetupDraft = ReturnType<typeof useReadwiseSetupDraft>;
type SetState<T> = (value: T) => void;

export interface ReadwiseSetupPayload {
  config: ReadwiseReaderConfig;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

interface SyncStateSetters {
  setIsStartingSync: SetState<boolean>;
  setIsSyncPreviewing: SetState<boolean>;
  setSyncNotice: SetState<string | null>;
  setSyncError: SetState<string | null>;
  setSyncIntent: SetState<ReadwiseSyncIntent | null>;
  setSyncPreview: SetState<NativeReadwiseSyncPreviewResult | null>;
}

interface SyncFlowActions {
  draft: ReadwiseSetupDraft;
  onPreviewSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseSyncPreviewResult | null>;
  onRunSync?: (input: ReadwiseSetupPayload) => Promise<unknown>;
}

export function enableReadwiseImportSource(sources: DraftImportSource[]) {
  return sources.map((source) =>
    source.kind && source.highlightPath.trim() && source.primaryPath.trim()
      ? { ...source, keepState: 'enabled' as const }
      : source
  );
}

export function disableReadwiseImportSource(sources: DraftImportSource[]) {
  return sources.map((source) =>
    source.kind ? { ...source, keepState: 'draft' as const } : source
  );
}

export function createReadwiseSetupPayload(
  draft: ReadwiseSetupDraft,
  config: ReadwiseReaderConfig,
  sources = draft.draftSources
) {
  return { config, readwiseRootPath: draft.draftRootPath, readwiseSources: sources };
}

function getValidatedReadwiseConfig(draft: ReadwiseSetupDraft) {
  return draft.previewResult?.success
    ? { ...draft.draftConfig, validatedAt: new Date().toISOString() }
    : draft.draftConfig;
}

function createSyncPayload(draft: ReadwiseSetupDraft, intent: ReadwiseSyncIntent) {
  if (intent === 'sync') {
    return createReadwiseSetupPayload(draft, draft.draftConfig);
  }
  return createReadwiseSetupPayload(
    draft,
    { ...getValidatedReadwiseConfig(draft), enabled: true },
    enableReadwiseImportSource(draft.draftSources)
  );
}

function resolveErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function openSyncPreview(
  intent: ReadwiseSyncIntent,
  actions: SyncFlowActions,
  setters: SyncStateSetters
) {
  if (!actions.onPreviewSync) {
    return;
  }
  setters.setSyncIntent(intent);
  setters.setSyncPreview(null);
  setters.setSyncNotice(null);
  setters.setSyncError(null);
  setters.setIsSyncPreviewing(true);
  try {
    const preview = await actions.onPreviewSync(createSyncPayload(actions.draft, intent));
    setters.setSyncPreview(preview);
    setters.setSyncError(preview ? null : 'Readwise preview is only available in the desktop app.');
  } catch (error) {
    setters.setSyncError(resolveErrorMessage(error, 'Readwise preview failed.'));
  } finally {
    setters.setIsSyncPreviewing(false);
  }
}

async function startSync(
  actions: SyncFlowActions,
  setters: SyncStateSetters,
  syncIntent: ReadwiseSyncIntent | null,
  syncPreview: NativeReadwiseSyncPreviewResult | null
) {
  if (!syncIntent || !syncPreview || !actions.onRunSync) {
    return;
  }
  const payload = createSyncPayload(actions.draft, syncIntent);
  setters.setIsStartingSync(true);
  setters.setSyncError(null);
  try {
    await actions.onRunSync(payload);
    setters.setSyncIntent(null);
    setters.setSyncPreview(null);
  } catch (error) {
    setters.setSyncError(resolveErrorMessage(error, 'Readwise sync failed.'));
  } finally {
    setters.setIsStartingSync(false);
  }
}

export function useReadwiseSyncPreviewFlow(actions: SyncFlowActions) {
  const [syncIntent, setSyncIntent] = useState<ReadwiseSyncIntent | null>(null);
  const [syncPreview, setSyncPreview] = useState<NativeReadwiseSyncPreviewResult | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncPreviewing, setIsSyncPreviewing] = useState(false);
  const [isStartingSync, setIsStartingSync] = useState(false);
  const setters = {
    setIsStartingSync,
    setIsSyncPreviewing,
    setSyncNotice,
    setSyncError,
    setSyncIntent,
    setSyncPreview
  };

  function closeSyncPreview() {
    if (isStartingSync) {
      return;
    }
    setSyncIntent(null);
    setSyncPreview(null);
    setSyncNotice(null);
    setSyncError(null);
  }

  return {
    closeSyncPreview,
    isStartingSync,
    isSyncPreviewing,
    openBlockedPreview: (notice: string) => {
      setSyncIntent('enable');
      setSyncPreview(null);
      setSyncError(null);
      setSyncNotice(notice);
    },
    openSyncPreview: (intent: ReadwiseSyncIntent) => openSyncPreview(intent, actions, setters),
    startSync: () => startSync(actions, setters, syncIntent, syncPreview),
    syncError,
    syncIntent,
    syncNotice,
    syncPreview
  };
}
