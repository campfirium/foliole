import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import { runRuntimeTextFileImport } from '../../shared/platform/importExecutionRuntimeRepository';
import { readLocalFile, saveLocalFile } from '../../shared/platform/localFileRuntimeRepository';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';

export type OpenedLocalFileSaveStatus = 'conflict' | 'error' | 'missing' | 'saved' | 'saving' | 'unsaved';

type EditablePreview = ExternalDocumentPreview & { editable: true; sourceKind: 'local_file' };

declare global {
  interface Window {
    __folioleFlushLocalFileBeforeClose?: () => Promise<boolean>;
  }
}

function resolveEditablePreview(preview: ExternalDocumentPreview | null): EditablePreview | null {
  return preview?.sourceKind === 'local_file' && preview.editable ? preview as EditablePreview : null;
}

function useResetLocalFileEditingState(args: {
  contentRef: MutableRefObject<string>;
  dirtyRef: MutableRefObject<boolean>;
  editablePreview: EditablePreview | null;
  preview: ExternalDocumentPreview | null;
  previewRef: MutableRefObject<EditablePreview | null>;
  setContentSnapshot: (content: string) => void;
  setStatus: (status: OpenedLocalFileSaveStatus) => void;
}) {
  const { contentRef, dirtyRef, editablePreview, preview, previewRef, setContentSnapshot, setStatus } = args;
  useEffect(() => {
    previewRef.current = editablePreview;
    contentRef.current = preview?.content ?? '';
    dirtyRef.current = false;
    setContentSnapshot(preview?.content ?? '');
    setStatus('saved');
  }, [contentRef, dirtyRef, editablePreview, preview, previewRef, setContentSnapshot, setStatus]);
}

function useFlushLocalFileSave(args: {
  contentRef: MutableRefObject<string>;
  dirtyRef: MutableRefObject<boolean>;
  previewRef: MutableRefObject<EditablePreview | null>;
  saveTimerRef: MutableRefObject<number | null>;
  setStatus: (status: OpenedLocalFileSaveStatus) => void;
}) {
  const { contentRef, dirtyRef, previewRef, saveTimerRef, setStatus } = args;
  return useCallback(async (force = false) => {
    const current = previewRef.current;
    if (!current || (!dirtyRef.current && !force)) return true;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setStatus('saving');
    const result = await saveLocalFile({
      content: contentRef.current,
      expectedFileSize: current.fileSize ?? null,
      expectedModifiedAt: current.modifiedAt ?? null,
      force,
      path: current.absolutePath
    });
    if (result.status === 'conflict') {
      setStatus('conflict');
      return false;
    }
    if (result.status === 'error') {
      setStatus(result.errorCode === 'missing' ? 'missing' : 'error');
      return false;
    }
    previewRef.current = { ...current, content: contentRef.current, fileSize: result.fileSize, modifiedAt: result.modifiedAt };
    dirtyRef.current = false;
    setStatus('saved');
    return true;
  }, [contentRef, dirtyRef, previewRef, saveTimerRef, setStatus]);
}

function useReloadLocalFileFromDisk(args: {
  contentRef: MutableRefObject<string>;
  dirtyRef: MutableRefObject<boolean>;
  previewRef: MutableRefObject<EditablePreview | null>;
  setContentSnapshot: (content: string) => void;
  setStatus: (status: OpenedLocalFileSaveStatus) => void;
}) {
  const { contentRef, dirtyRef, previewRef, setContentSnapshot, setStatus } = args;
  return useCallback(async () => {
    const current = previewRef.current;
    if (!current) return;
    const result = await readLocalFile(current.absolutePath);
    if (result.status !== 'ready') {
      setStatus(result.status === 'missing' ? 'missing' : 'error');
      return;
    }
    previewRef.current = { ...current, content: result.content, fileSize: result.fileSize, modifiedAt: result.modifiedAt };
    contentRef.current = result.content;
    dirtyRef.current = false;
    setContentSnapshot(result.content);
    setStatus('saved');
  }, [contentRef, dirtyRef, previewRef, setContentSnapshot, setStatus]);
}

function useOpenedLocalFileWindowBindings(args: {
  dirtyRef: MutableRefObject<boolean>;
  editablePreview: EditablePreview | null;
  flushSave: (force?: boolean) => Promise<boolean>;
  reloadFromDisk: () => Promise<void>;
}) {
  const { dirtyRef, editablePreview, flushSave, reloadFromDisk } = args;
  useEffect(() => {
    if (!editablePreview) return undefined;
    window.__folioleFlushLocalFileBeforeClose = flushSave;
    const onFocus = () => {
      if (!dirtyRef.current) void reloadFromDisk();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void flushSave();
      }
    };
    const onPageHide = () => void flushSave();
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      if (window.__folioleFlushLocalFileBeforeClose === flushSave) delete window.__folioleFlushLocalFileBeforeClose;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [dirtyRef, editablePreview, flushSave, reloadFromDisk]);
}

function useOpenedLocalFileChangeHandler(args: {
  contentRef: MutableRefObject<string>;
  dirtyRef: MutableRefObject<boolean>;
  flushSave: (force?: boolean) => Promise<boolean>;
  previewRef: MutableRefObject<EditablePreview | null>;
  saveTimerRef: MutableRefObject<number | null>;
  setStatus: (status: OpenedLocalFileSaveStatus) => void;
}) {
  const { contentRef, dirtyRef, flushSave, previewRef, saveTimerRef, setStatus } = args;
  return useCallback((nextContent: string) => {
    if (!previewRef.current) return;
    contentRef.current = nextContent;
    dirtyRef.current = true;
    setStatus('unsaved');
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void flushSave(), 1000);
  }, [contentRef, dirtyRef, flushSave, previewRef, saveTimerRef, setStatus]);
}

export function useOpenedLocalFileEditing(args: {
  onImportedNodeId: (nodeId: string) => void;
  preview: ExternalDocumentPreview | null;
}) {
  const editablePreview = resolveEditablePreview(args.preview);
  const [contentSnapshot, setContentSnapshot] = useState(args.preview?.content ?? '');
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<OpenedLocalFileSaveStatus>('saved');
  const contentRef = useRef(contentSnapshot);
  const dirtyRef = useRef(false);
  const previewRef = useRef(editablePreview);
  const saveTimerRef = useRef<number | null>(null);

  const stateHandles = useMemo(() => ({
    contentRef,
    dirtyRef,
    previewRef,
    saveTimerRef,
    setContentSnapshot,
    setStatus
  }), []);
  useResetLocalFileEditingState({ ...stateHandles, editablePreview, preview: args.preview });
  const flushSave = useFlushLocalFileSave(stateHandles);
  const handleChange = useOpenedLocalFileChangeHandler({ ...stateHandles, flushSave });
  const reloadFromDisk = useReloadLocalFileFromDisk(stateHandles);

  const importAsTopic = useCallback(async () => {
    const current = previewRef.current;
    if (!current || !(await flushSave())) return;
    setIsImporting(true);
    try {
      const result = await runRuntimeTextFileImport('adopt', 'file_name', { filePath: current.absolutePath });
      if (result?.nodeId) {
        await refreshWorkspaceState('formal-import');
        args.onImportedNodeId(result.nodeId);
      }
    } finally {
      setIsImporting(false);
    }
  }, [args, flushSave]);

  useOpenedLocalFileWindowBindings({ dirtyRef, editablePreview, flushSave, reloadFromDisk });

  return useMemo(() => ({
    content: contentRef.current,
    flushSave,
    handleChange,
    importAsTopic,
    isEditable: Boolean(editablePreview),
    isImporting,
    reloadFromDisk,
    status
  }), [contentSnapshot, editablePreview, flushSave, handleChange, importAsTopic, isImporting, reloadFromDisk, status]);
}
