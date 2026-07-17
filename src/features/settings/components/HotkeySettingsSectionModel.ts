import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { startRuntimeHotkeyRecording } from '../../../shared/platform/nativeHotkeyRecordingRuntime';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

import { nativeInputToShortcutLabel } from './hotkeyShortcutLabel';

export type HotkeySlot = 'primary' | 'secondary';
export type HotkeyFilterMode = 'all' | 'assigned' | 'customized' | 'unassigned';
type RecordingHotkey = { commandId: string; slot: HotkeySlot } | null;
type DraftById = Record<string, { primary: string; secondary: string }>;
type SearchRecording = 'hotkey-search' | null;

type NativeCaptureArgs = {
  cancelRecordingRef: MutableRefObject<() => void>;
  recordShortcutRef: MutableRefObject<(commandId: string, slot: HotkeySlot, nextLabel: string) => void>;
  recording: RecordingHotkey;
  searchRecording: SearchRecording;
  setQueryFromHotkeyRef: MutableRefObject<(nextLabel: string) => void>;
};

export function joinShortcutLabels(primary: string, secondary: string) {
  return [primary, secondary].map((value) => value.trim()).filter(Boolean).join(', ');
}

function createDraftById(items: HotkeySettingItem[]) {
  const nextDrafts: DraftById = {};
  for (const item of items) {
    nextDrafts[item.commandId] = {
      primary: item.primaryShortcutLabel,
      secondary: item.secondaryShortcutLabel
    };
  }
  return nextDrafts;
}

function hotkeyMatchesFilter(item: HotkeySettingItem, filterMode: HotkeyFilterMode) {
  const hasShortcut = Boolean(item.primaryShortcutLabel || item.secondaryShortcutLabel);
  if (filterMode === 'assigned') return hasShortcut;
  if (filterMode === 'customized') return item.isCustomized;
  if (filterMode === 'unassigned') return !hasShortcut;
  return true;
}

function hotkeyMatchesQuery(item: HotkeySettingItem, query: string) {
  const normalizedQuery = query
    .replaceAll('⌘', ' command cmd ')
    .replaceAll('⌥', ' option alt ')
    .replaceAll('⇧', ' shift ')
    .replaceAll('⌃', ' control ctrl ')
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = [item.title, item.commandId, item.section, item.shortcutSummaryLabel]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  const queryTokens = normalizedQuery.split(/[^a-z0-9]+/).filter(Boolean);
  return queryTokens.every((token) => haystack.includes(token));
}

function useHotkeyDraftState(items: HotkeySettingItem[], recording: RecordingHotkey) {
  const pendingRecordedIdsRef = useRef(new Set<string>());
  const [draftById, setDraftById] = useState<DraftById>(() => createDraftById(items));
  const [messageById, setMessageById] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraftById((current) => {
      const nextDrafts = createDraftById(items);
      for (const commandId of pendingRecordedIdsRef.current) {
        const currentDraft = current[commandId];
        const nextDraft = nextDrafts[commandId];
        if (!currentDraft || !nextDraft) {
          pendingRecordedIdsRef.current.delete(commandId);
          continue;
        }
        if (currentDraft.primary === nextDraft.primary && currentDraft.secondary === nextDraft.secondary) {
          pendingRecordedIdsRef.current.delete(commandId);
        } else {
          nextDrafts[commandId] = currentDraft;
        }
      }
      if (recording) {
        const draft = current[recording.commandId] ?? nextDrafts[recording.commandId];
        if (draft) nextDrafts[recording.commandId] = draft;
      }
      return nextDrafts;
    });
  }, [items, recording?.commandId]);
  return { draftById, messageById, pendingRecordedIdsRef, setDraftById, setMessageById };
}

function useNativeHotkeyRecordingCapture(args: NativeCaptureArgs) {
  useEffect(() => {
    const isActive = Boolean(args.recording || args.searchRecording);
    if (!isActive) {
      return undefined;
    }
    const stopRecording = startRuntimeHotkeyRecording((input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'Escape') {
        args.cancelRecordingRef.current();
        return;
      }
      const nextLabel = nativeInputToShortcutLabel(
        input,
        args.recording?.commandId === APP_COMMAND_IDS.globalCaptureToInbox
      );
      if (!nextLabel) return;
      if (args.recording) {
        args.recordShortcutRef.current(args.recording.commandId, args.recording.slot, nextLabel);
      } else {
        args.setQueryFromHotkeyRef.current(nextLabel);
      }
    });
    return stopRecording ?? undefined;
  }, [args.recording?.commandId, args.recording?.slot, args.searchRecording]);
}

function useFilteredHotkeyItems(items: HotkeySettingItem[], filterMode: HotkeyFilterMode, query: string) {
  return useMemo(
    () => items.filter((item) => hotkeyMatchesFilter(item, filterMode) && hotkeyMatchesQuery(item, query)),
    [filterMode, items, query]
  );
}

function useHotkeyRecordingActions(args: {
  invalidShortcutMessage: string;
  onUpdate: (commandId: string, slot: HotkeySlot, nextLabel: string) => HotkeyUpdateResult;
  pendingRecordedIdsRef: MutableRefObject<Set<string>>;
  setDraftById: Dispatch<SetStateAction<DraftById>>;
  setMessageById: Dispatch<SetStateAction<Record<string, string>>>;
  setRecording: Dispatch<SetStateAction<RecordingHotkey>>;
  setSearchRecording: Dispatch<SetStateAction<SearchRecording>>;
}) {
  const beginRecording = useCallback((commandId: string, slot: HotkeySlot) => {
    args.setSearchRecording(null);
    args.setRecording({ commandId, slot });
    args.setMessageById((current) => {
      const next = { ...current };
      delete next[commandId];
      return next;
    });
  }, [args]);
  const cancelRecording = useCallback(() => {
    args.setRecording(null);
    args.setSearchRecording(null);
  }, [args]);
  const recordShortcut = useCallback((commandId: string, slot: HotkeySlot, nextLabel: string) => {
    const result = args.onUpdate(commandId, slot, nextLabel);
    if (result.status !== 'applied') {
      args.setMessageById((current) => ({ ...current, [commandId]: result.message ?? args.invalidShortcutMessage }));
      return;
    }
    const normalized = result.normalizedShortcutLabel ?? nextLabel;
    args.pendingRecordedIdsRef.current.add(commandId);
    args.setDraftById((current) => ({
      ...current,
      [commandId]: {
        primary: slot === 'primary' ? normalized : current[commandId]?.primary ?? '',
        secondary: slot === 'secondary' ? normalized : current[commandId]?.secondary ?? ''
      }
    }));
    args.setRecording(null);
    args.setMessageById((current) => {
      const next = { ...current };
      delete next[commandId];
      return next;
    });
  }, [args]);
  const clearShortcut = useCallback((commandId: string, slot: HotkeySlot) => {
    recordShortcut(commandId, slot, '');
  }, [recordShortcut]);
  return { beginRecording, cancelRecording, recordShortcut, clearShortcut };
}

export function useHotkeySectionModel(
  items: HotkeySettingItem[],
  onUpdate: (commandId: string, slot: HotkeySlot, nextLabel: string) => HotkeyUpdateResult
) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<HotkeyFilterMode>('all');
  const [recording, setRecording] = useState<RecordingHotkey>(null);
  const [searchRecording, setSearchRecording] = useState<SearchRecording>(null);
  const draftState = useHotkeyDraftState(items, recording);
  const filteredItems = useFilteredHotkeyItems(items, filterMode, query);
  const actions = useHotkeyRecordingActions({
    invalidShortcutMessage: t('settings.hotkeys.invalidShortcut'),
    onUpdate,
    pendingRecordedIdsRef: draftState.pendingRecordedIdsRef,
    setDraftById: draftState.setDraftById,
    setMessageById: draftState.setMessageById,
    setRecording,
    setSearchRecording
  });
  const beginSearchRecording = useCallback(() => {
    setRecording(null);
    setSearchRecording('hotkey-search');
  }, []);
  const setQueryFromHotkey = useCallback((nextLabel: string) => {
    setQuery(nextLabel);
    setSearchRecording(null);
  }, []);
  const cancelRecordingRef = useRef(actions.cancelRecording);
  const recordShortcutRef = useRef(actions.recordShortcut);
  const setQueryFromHotkeyRef = useRef(setQueryFromHotkey);
  cancelRecordingRef.current = actions.cancelRecording;
  recordShortcutRef.current = actions.recordShortcut;
  setQueryFromHotkeyRef.current = setQueryFromHotkey;
  useNativeHotkeyRecordingCapture({
    cancelRecordingRef,
    recordShortcutRef,
    recording,
    searchRecording,
    setQueryFromHotkeyRef
  });
  return {
    query,
    setQuery,
    filterMode,
    setFilterMode,
    filteredItems,
    draftById: draftState.draftById,
    messageById: draftState.messageById,
    recording,
    searchRecording,
    beginSearchRecording,
    ...actions
  };
}
