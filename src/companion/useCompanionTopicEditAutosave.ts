import { useCallback, useEffect, useMemo, useReducer } from 'react';

import type { EditorContentChangeMeta } from '../features/editor/adapters/EditorAdapter';
import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import { ContentDraftSession } from '../shared/platform/companion/editing/contentDraftSession';
import { ContentEditRound } from '../shared/platform/companion/editing/contentEditRound';

import { useCompanionDrafts } from './CompanionDraftProvider';

export const COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS = 0;

interface UseCompanionTopicEditAutosaveArgs {
  canEdit: boolean;
  initialContent: string;
  initialVersionId?: string | null;
  nodeId: string;
  onSaveContent?: CompanionContentSaveHandler;
  saveDelayMs?: number;
}

export function useCompanionTopicEditAutosave(args: UseCompanionTopicEditAutosaveArgs) {
  const drafts = useCompanionDrafts();
  const [, render] = useReducer((value: number) => value + 1, 0);
  const session = useMemo(() => {
    const retained = drafts.get(args.nodeId);
    if (retained) return retained;
    if (!args.onSaveContent) return null;
    const created = new ContentDraftSession(args.nodeId, {
      content: args.initialContent, versionId: args.initialVersionId ?? ''
    }, args.onSaveContent, args.saveDelayMs ?? COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS);
    drafts.set(args.nodeId, created);
    return created;
    // Source refreshes must not replace an existing node's edit owner.
  }, [drafts, args.nodeId, Boolean(args.onSaveContent)]);
  if (session && args.onSaveContent) session.save = args.onSaveContent;
  const editRound = useMemo(() => session ? new ContentEditRound(session) : null, [session]);

  useEffect(() => session?.subscribe(render), [session]);
  useEffect(() => {
    void session?.start().then(() => session.refresh()).catch(() => undefined);
  }, [session, args.initialContent, args.initialVersionId]);
  useEffect(() => () => {
    if (!session) return;
    void session.flush().then(async () => {
      if (!session.dirty && !session.attached && drafts.get(session.nodeId) === session) {
        await session.dispose();
        drafts.delete(session.nodeId);
      }
    }).catch(() => undefined);
  }, [drafts, session]);
  useEffect(() => {
    if (!args.canEdit) void session?.flush().catch(() => undefined);
  }, [args.canEdit, session]);

  const handleChange = useCallback((value: string, meta?: EditorContentChangeMeta) => {
    if (!args.canEdit) return;
    editRound?.capture();
    session?.change(value, meta?.newImageReferences);
  }, [args.canEdit, editRound, session]);
  const handleRevealChange = useCallback((value: string, meta?: EditorContentChangeMeta) => {
    if (!args.canEdit) return;
    editRound?.capture();
    session?.changeReveal(value, meta?.newImageReferences);
  }, [args.canEdit, editRound, session]);
  const flushPendingSave = useCallback(async () => { await session?.flush(); }, [session]);
  const markBufferedInput = useCallback(() => { if (args.canEdit) session?.markBufferedInput(); }, [args.canEdit, session]);
  const markRevealBufferedInput = useCallback(() => { if (args.canEdit) session?.markBufferedInput('reveal'); }, [args.canEdit, session]);
  return { editRound, handleRevealChange, markRevealBufferedInput, reveal: session?.reveal ?? null,
    error: session?.error ?? null, flushPendingSave, handleChange, markBufferedInput,
    ready: session?.ready ?? false,
    value: session?.value ?? args.initialContent };
}
