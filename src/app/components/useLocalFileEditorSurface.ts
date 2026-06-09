import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type {
  NativeLocalFileDocument,
  NativeLocalFileEntry
} from '../../../lib/platform/nativeLocalFileCommandMap';
import { runRuntimeTextFileImport } from '../../shared/platform/importExecutionRuntimeRepository';
import {
  listLocalFiles,
  readLocalFile,
  saveLocalFile,
} from '../../shared/platform/localFileRuntimeRepository';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';

import { useLocalFileEditorSubscriptions } from './useLocalFileEditorSubscriptions';

export interface LocalFileSession {
  content: string;
  document: NativeLocalFileDocument;
}

export type LocalFileSaveStatus = 'conflict' | 'error' | 'missing' | 'saved' | 'saving' | 'unsaved';

interface LocalFileEditorStateHandles {
  dirtyRef: MutableRefObject<boolean>;
  saveTimerRef: MutableRefObject<number | null>;
  sessionRef: MutableRefObject<LocalFileSession | null>;
  setEntries: Dispatch<SetStateAction<NativeLocalFileEntry[]>>;
  setImportStatus: Dispatch<SetStateAction<string | null>>;
  setSession: Dispatch<SetStateAction<LocalFileSession | null>>;
  setStatus: Dispatch<SetStateAction<LocalFileSaveStatus>>;
}

function isSameDiskState(entry: { fileSize: number | null; modifiedAt: string | null }, document: NativeLocalFileDocument) {
  return entry.fileSize === document.fileSize && entry.modifiedAt === document.modifiedAt;
}

function useLocalFileState() {
  const [entries, setEntries] = useState<NativeLocalFileEntry[]>([]);
  const [session, setSession] = useState<LocalFileSession | null>(null);
  const [status, setStatus] = useState<LocalFileSaveStatus>('saved');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const sessionRef = useRef<LocalFileSession | null>(null);
  const dirtyRef = useRef(false);
  return { dirtyRef, entries, importStatus, saveTimerRef, session, sessionRef, setEntries, setImportStatus, setSession, setStatus, status };
}

function useRefreshLocalFileEntries(setEntries: LocalFileEditorStateHandles['setEntries']) {
  return useCallback(async () => {
    setEntries(await listLocalFiles());
  }, [setEntries]);
}

function useFlushLocalFileSave(handles: LocalFileEditorStateHandles, refreshEntries: () => Promise<void>) {
  return useCallback(async (force = false) => {
    const current = handles.sessionRef.current;
    if (!current || (!handles.dirtyRef.current && !force)) return true;
    if (handles.saveTimerRef.current !== null) {
      window.clearTimeout(handles.saveTimerRef.current);
      handles.saveTimerRef.current = null;
    }
    handles.setStatus('saving');
    const result = await saveLocalFile({
      content: current.content,
      expectedFileSize: current.document.fileSize,
      expectedModifiedAt: current.document.modifiedAt,
      force,
      path: current.document.absolutePath
    });
    if (result.status === 'conflict') {
      handles.setStatus('conflict');
      return false;
    }
    if (result.status === 'error') {
      handles.setStatus(result.errorCode === 'missing' ? 'missing' : 'error');
      return false;
    }
    const next = {
      ...current,
      document: { ...current.document, content: current.content, fileSize: result.fileSize, missingAt: null, modifiedAt: result.modifiedAt }
    };
    handles.sessionRef.current = next;
    handles.dirtyRef.current = false;
    handles.setSession(next);
    handles.setStatus('saved');
    await refreshEntries();
    return true;
  }, [handles, refreshEntries]);
}

function useOpenLocalFilePath(handles: LocalFileEditorStateHandles, refreshEntries: () => Promise<void>) {
  return useCallback(async (filePath: string) => {
    const result = await readLocalFile(filePath);
    if (result.status === 'ready') {
      const next = { content: result.content, document: result };
      handles.sessionRef.current = next;
      handles.dirtyRef.current = false;
      handles.setImportStatus(null);
      handles.setSession(next);
      handles.setStatus('saved');
      await refreshEntries();
      return;
    }
    handles.setStatus(result.status === 'missing' ? 'missing' : 'error');
    await refreshEntries();
  }, [handles, refreshEntries]);
}

function useLocalFileOperations(handles: LocalFileEditorStateHandles) {
  const refreshEntries = useRefreshLocalFileEntries(handles.setEntries);
  const flushSave = useFlushLocalFileSave(handles, refreshEntries);
  const openPath = useOpenLocalFilePath(handles, refreshEntries);
  const openPathAfterFlush = useCallback(async (path: string) => {
    if (!(await flushSave())) return;
    await openPath(path);
  }, [flushSave, openPath]);
  const scheduleSave = useCallback(() => {
    if (handles.saveTimerRef.current !== null) window.clearTimeout(handles.saveTimerRef.current);
    handles.saveTimerRef.current = window.setTimeout(() => void flushSave(), 1000);
  }, [flushSave, handles]);
  return { flushSave, openPath, openPathAfterFlush, refreshEntries, scheduleSave };
}

function useLocalFileActions(handles: LocalFileEditorStateHandles, operations: ReturnType<typeof useLocalFileOperations>) {
  const handleChange = useCallback((content: string) => {
    const current = handles.sessionRef.current;
    if (!current) return;
    const next = { ...current, content };
    handles.sessionRef.current = next;
    handles.dirtyRef.current = true;
    handles.setSession(next);
    handles.setStatus('unsaved');
    operations.scheduleSave();
  }, [handles, operations]);
  const reloadFromDisk = useCallback(async () => {
    const current = handles.sessionRef.current;
    if (current) await operations.openPath(current.document.absolutePath);
  }, [handles, operations]);
  const closeSession = useCallback(async () => {
    if (!(await operations.flushSave())) return;
    handles.sessionRef.current = null;
    handles.dirtyRef.current = false;
    handles.setImportStatus(null);
    handles.setSession(null);
    handles.setStatus('saved');
  }, [handles, operations]);
  return { closeSession, handleChange, reloadFromDisk };
}

function useImportLocalFileAsTopic(handles: LocalFileEditorStateHandles, flushSave: (force?: boolean) => Promise<boolean>) {
  return useCallback(async () => {
    const current = handles.sessionRef.current;
    if (!current || !(await flushSave())) return;
    handles.setImportStatus('Importing');
    const result = await runRuntimeTextFileImport('adopt', 'file_name', { filePath: current.document.absolutePath });
    if (result?.nodeId) {
      await refreshWorkspaceState('formal-import');
      handles.setImportStatus('Imported as Topic');
      return;
    }
    handles.setImportStatus('Import failed');
  }, [flushSave, handles]);
}

function useCheckLocalFileDiskState(handles: LocalFileEditorStateHandles) {
  return useCallback(async () => {
    const current = handles.sessionRef.current;
    if (!current) return;
    const result = await readLocalFile(current.document.absolutePath);
    if (result.status !== 'ready') {
      handles.setStatus(result.status === 'missing' ? 'missing' : 'error');
      return;
    }
    if (isSameDiskState(result, current.document)) return;
    if (handles.dirtyRef.current) {
      handles.setStatus('conflict');
      return;
    }
    const next = { content: result.content, document: result };
    handles.sessionRef.current = next;
    handles.setSession(next);
    handles.setStatus('saved');
  }, [handles]);
}

export function useLocalFileEditorSurface() {
  const state = useLocalFileState();
  const handles = {
    dirtyRef: state.dirtyRef,
    saveTimerRef: state.saveTimerRef,
    sessionRef: state.sessionRef,
    setEntries: state.setEntries,
    setImportStatus: state.setImportStatus,
    setSession: state.setSession,
    setStatus: state.setStatus
  };
  const operations = useLocalFileOperations(handles);
  const actions = useLocalFileActions(handles, operations);
  const importAsTopic = useImportLocalFileAsTopic(handles, operations.flushSave);
  const checkDiskState = useCheckLocalFileDiskState(handles);
  useLocalFileEditorSubscriptions({ checkDiskState, flushSave: operations.flushSave, openPathAfterFlush: operations.openPathAfterFlush, refreshEntries: operations.refreshEntries });
  return { ...actions, entries: state.entries, flushSave: operations.flushSave, handleChange: actions.handleChange, importAsTopic, importStatus: state.importStatus, openPathAfterFlush: operations.openPathAfterFlush, session: state.session, status: state.status };
}
