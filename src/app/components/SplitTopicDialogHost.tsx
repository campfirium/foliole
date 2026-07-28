import { useEffect, useMemo, useState } from 'react';

import {
  buildSplitTopicNodeOrder,
  buildSplitTopicPreview,
  type SplitTopicPreviewPart
} from '../../../lib/core/nodes/splitTopicModel';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { saveSplitTopicWorkspaceMutation } from '../../shared/platform/workspaceRuntimeRepository';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { sanitizeNavigationState } from '../../store/workspaceNavigation';
import { createWorkspaceNodeMutationPatch } from '../../store/workspaceNodeMutationPatch';
import { reconcileReviewSession } from '../../store/workspaceReviewSessionSync';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceState } from '../../store/workspaceStoreTypes';

import {
  DEFAULT_SPLIT_TOPIC_FORM,
  SplitTopicControls,
  SplitTopicPreviewList,
  type SplitTopicFormState
} from './SplitTopicDialogParts';
import {
  readSplitTopicDialogRequest,
  SPLIT_TOPIC_DIALOG_REQUEST_EVENT,
  type SplitTopicDialogRequest
} from './SplitTopicDialogRequest';

type Busy = 'idle' | 'splitting';

function useSplitTopicDialogRequest() {
  const [request, setRequest] = useState<SplitTopicDialogRequest | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const next = readSplitTopicDialogRequest(event);
      if (next) setRequest(next);
    };
    window.addEventListener(SPLIT_TOPIC_DIALOG_REQUEST_EVENT, receive);
    return () => window.removeEventListener(SPLIT_TOPIC_DIALOG_REQUEST_EVENT, receive);
  }, []);
  return { request, setRequest };
}

function buildGeneratedTopic(part: SplitTopicPreviewPart, source: WorkspaceState['nodesById'][string], timestamp: string) {
  return {
    id: `node-${crypto.randomUUID()}`,
    parentNodeId: source.parentNodeId,
    kind: 'topic' as const,
    title: part.title,
    isTitleManual: false,
    hideTitleHeading: false,
    hasContent: part.body.trim().length > 0,
    content: part.body,
    anchorLink: null,
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

type GeneratedSplitTopicNode = ReturnType<typeof buildGeneratedTopic>;

function mergeGeneratedTopicDocuments(
  nodesById: WorkspaceState['nodesById'],
  generatedNodes: GeneratedSplitTopicNode[]
) {
  const nextNodesById = { ...nodesById };
  for (const generatedNode of generatedNodes) {
    const runtimeNode = nextNodesById[generatedNode.id];
    if (!runtimeNode) continue;
    nextNodesById[generatedNode.id] = {
      ...runtimeNode,
      content: generatedNode.content,
      hasContent: generatedNode.content.trim().length > 0,
      hideTitleHeading: generatedNode.hideTitleHeading,
      imageRegions: null,
      reveal: null,
      virtualFilter: null
    };
  }
  return nextNodesById;
}

function applySplitTopicResult(args: {
  deletedAt: string;
  generatedNodes: GeneratedSplitTopicNode[];
  result: NonNullable<Awaited<ReturnType<typeof saveSplitTopicWorkspaceMutation>>>;
  sourceNodeId: string;
}) {
  useWorkspaceStore.setState((state) => {
    const runtimePatch = createWorkspaceNodeMutationPatch(state, args.result);
    const nextTrashedNodeIds = [...new Set([...state.trashedNodeIds, args.sourceNodeId])];
    const nextTrashedNodeDeletedAtById = {
      ...state.trashedNodeDeletedAtById,
      [args.sourceNodeId]: args.deletedAt
    };
    const nextNodesById = mergeGeneratedTopicDocuments(runtimePatch.nodesById ?? state.nodesById, args.generatedNodes);
    const nextState = {
      ...state,
      ...runtimePatch,
      nodesById: nextNodesById,
      trashedNodeDeletedAtById: nextTrashedNodeDeletedAtById,
      trashedNodeIds: nextTrashedNodeIds
    };
    const hiddenNodeIds = new Set(nextTrashedNodeIds);
    return {
      ...runtimePatch,
      nodesById: nextNodesById,
      navigation: sanitizeNavigationState(state.navigation, nextState.nodesById, hiddenNodeIds),
      rendererBoundaryKeepNodeIds: args.generatedNodes.map((node) => node.id),
      reviewSession: reconcileReviewSession(nextState, runtimePatch.activeNodeId ?? state.activeNodeId),
      trashedNodeDeletedAtById: nextTrashedNodeDeletedAtById,
      trashedNodeIds: nextTrashedNodeIds
    };
  });
}

function readDialogSource(request: SplitTopicDialogRequest | null) {
  if (!request) return null;
  const state = useWorkspaceStore.getState();
  const source = state.nodesById[request.sourceNodeId];
  if (!source || source.kind !== 'topic' || state.trashedNodeIds.includes(source.id)) {
    return null;
  }
  return { source, state };
}

type SourceContext = NonNullable<ReturnType<typeof readDialogSource>>;

function createConfirmSplitTopic(args: {
  preview: SplitTopicPreviewPart[];
  setBusy: (busy: Busy) => void;
  setError: (message: string | null) => void;
  setRequest: (request: SplitTopicDialogRequest | null) => void;
  sourceContext: SourceContext;
  t: ReturnType<typeof useTranslation>;
}) {
  return async () => {
    if (args.preview.length === 0) return;
    args.setBusy('splitting');
    args.setError(null);
    const deletedAt = new Date().toISOString();
    const generatedNodes = args.preview.map((part) =>
      buildGeneratedTopic(part, args.sourceContext.source, deletedAt)
    );
    const nextNodeOrder = buildSplitTopicNodeOrder({
      generatedNodeIds: generatedNodes.map((node) => node.id),
      nodeOrder: args.sourceContext.state.nodeOrder,
      sourceNodeId: args.sourceContext.source.id
    });
    try {
      const result = await saveSplitTopicWorkspaceMutation({
        activeNodeId: generatedNodes[0]!.id,
        deletedAt,
        generatedNodes,
        nodeOrder: nextNodeOrder,
        sourceNodeId: args.sourceContext.source.id
      });
      if (!result) throw new Error(args.t('desktop.splitTopic.failed'));
      applySplitTopicResult({ deletedAt, generatedNodes, result, sourceNodeId: args.sourceContext.source.id });
      args.setRequest(null);
      showAppRuntimeNotice(args.t('desktop.splitTopic.complete'), 'success');
    } catch (caught) {
      args.setError(caught instanceof Error ? caught.message : args.t('desktop.splitTopic.failed'));
    } finally {
      args.setBusy('idle');
    }
  };
}

export function SplitTopicDialogHost() {
  const t = useTranslation();
  const { request, setRequest } = useSplitTopicDialogRequest();
  const [form, setForm] = useState<SplitTopicFormState>(DEFAULT_SPLIT_TOPIC_FORM);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | null>(null);
  const sourceContext = readDialogSource(request);
  const preview = useMemo(() => {
    if (!sourceContext || !form.delimiter) return [];
    return buildSplitTopicPreview({
      content: sourceContext.source.content,
      delimiter: form.delimiter,
      footerText: form.footerText,
      headerText: form.headerText,
      keepDelimiter: form.keepDelimiter
    });
  }, [form, sourceContext]);

  useEffect(() => {
    if (request) {
      setForm(DEFAULT_SPLIT_TOPIC_FORM);
      setError(null);
    }
  }, [request]);

  if (!request || !sourceContext) return null;

  const close = () => busy === 'idle' && setRequest(null);
  const confirm = createConfirmSplitTopic({ preview, setBusy, setError, setRequest, sourceContext, t });

  return (
    <AppDialog open onOpenChange={(open) => !open && close()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="flex max-h-[min(760px,calc(100vh-32px))] w-[min(900px,calc(100vw-32px))] flex-col p-6">
          <AppDialogTitle>{t('desktop.splitTopic.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-2">{t('desktop.splitTopic.description')}</AppDialogDescription>
          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <SplitTopicControls form={form} onChange={setForm} />
            <SplitTopicPreviewList delimiter={form.delimiter} parts={preview} />
          </div>
          {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <AppButton disabled={busy !== 'idle'} onClick={close} variant="subtle">{t('common.cancel')}</AppButton>
            <AppButton disabled={!form.delimiter || preview.length === 0} loading={busy === 'splitting'} loadingLabel={t('desktop.splitTopic.splitting')} onClick={() => void confirm()}>
              {t('desktop.splitTopic.confirm')}
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
