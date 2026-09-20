import { useCallback, useEffect, useMemo, useReducer } from 'react';

import type { CompanionContentSaveHandler } from '../shared/platform/companion/editing/companionContentEditContract';
import { ContentDraftSession } from '../shared/platform/companion/editing/contentDraftSession';

import { useCompanionDrafts } from './CompanionDraftProvider';

export const COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS = 1200;

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

  useEffect(() => session?.subscribe(render), [session]);
  useEffect(() => { void session?.refresh(); }, [session, args.initialContent, args.initialVersionId]);
  useEffect(() => () => {
    if (!session) return;
    void session.flush().then(() => {
      if (!session.dirty && !session.attached && drafts.get(session.nodeId) === session) drafts.delete(session.nodeId);
    }).catch(() => undefined);
  }, [drafts, session]);
  useEffect(() => {
    if (!args.canEdit) void session?.flush().catch(() => undefined);
  }, [args.canEdit, session]);

  const handleChange = useCallback((value: string) => {
    if (args.canEdit) session?.change(value);
  }, [args.canEdit, session]);
  const flushPendingSave = useCallback(async () => { await session?.flush(); }, [session]);
  return { error: session?.error ?? null, flushPendingSave, handleChange,
    value: session?.value ?? args.initialContent };
}
