import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  loadDiscoursePublishCatalogFromRuntime,
  loadDiscoursePublishDraftFromRuntime
} from '../../shared/platform/discoursePublishRepository';

import {
  readPublishDetails,
  type PublishFormState
} from './discoursePublishDialogModel';
import {
  DISCOURSE_PUBLISH_DIALOG_REQUEST_EVENT,
  readDiscoursePublishDialogRequest,
  type DiscoursePublishDialogRequest
} from './discoursePublishDialogRequest';
import { type CatalogState } from './DiscoursePublishFields';
import { withCatalogDefaults } from './discoursePublishFieldUtils';

type SetCatalogState = (state: CatalogState | ((current: CatalogState) => CatalogState)) => void;

async function loadDialogCatalog(args: {
  currentRequestSeq: () => number;
  requestSeq: number;
  setCatalog: SetCatalogState;
  t: ReturnType<typeof useTranslation>;
}) {
  const isCurrent = () => args.requestSeq === args.currentRequestSeq();
  try {
    const cached = await loadDiscoursePublishCatalogFromRuntime();
    if (!isCurrent()) return;
    if (!cached || !cached.from_cache) {
      args.setCatalog({ catalog: cached, error: null, loading: false });
      return;
    }
    args.setCatalog({ catalog: cached, error: null, loading: true });
  } catch {
    if (isCurrent()) args.setCatalog({ catalog: null, error: args.t('desktop.discoursePublish.catalog.error'), loading: false });
    return;
  }
  try {
    const refreshed = await loadDiscoursePublishCatalogFromRuntime({ refresh: true });
    if (!isCurrent()) return;
    args.setCatalog({
      catalog: refreshed,
      error: refreshed?.from_cache ? args.t('desktop.discoursePublish.catalog.error') : null,
      loading: false
    });
  } catch {
    if (!isCurrent()) return;
    args.setCatalog((current) => ({
      catalog: current.catalog,
      error: args.t('desktop.discoursePublish.catalog.error'),
      loading: false
    }));
  }
}

async function restoreDraft(args: {
  currentRequestSeq: () => number;
  nodeId: string;
  requestSeq: number;
  setForm: (form: PublishFormState) => void;
}) {
  try {
    const draft = await loadDiscoursePublishDraftFromRuntime(args.nodeId);
    if (!draft || args.requestSeq !== args.currentRequestSeq()) return;
    args.setForm({ categoryId: draft.category_id ? String(draft.category_id) : '', tags: draft.tags.join(', ') });
  } catch {
    // Fall back to published binding or catalog defaults when the device draft is unavailable.
  }
}

export function useDiscoursePublishDialogRequest() {
  const t = useTranslation();
  const [request, setRequest] = useState<DiscoursePublishDialogRequest | null>(null);
  const [form, setForm] = useState<PublishFormState>({ categoryId: '', tags: '' });
  const [catalog, setCatalog] = useState<CatalogState>({ catalog: null, error: null, loading: false });
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const requestSeqRef = useRef(0);
  useEffect(() => {
    const handleRequest = (event: Event) => {
      const nextRequest = readDiscoursePublishDialogRequest(event);
      if (!nextRequest) return;
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      setRequest(nextRequest);
      const details = readPublishDetails(nextRequest.content);
      setForm({ categoryId: details.categoryId ? String(details.categoryId) : '', tags: details.tags.join(', ') });
      setShowAllCategories(false);
      setShowAllTags(false);
      void restoreDraft({ currentRequestSeq: () => requestSeqRef.current, nodeId: nextRequest.nodeId, requestSeq, setForm });
      if (nextRequest.catalog) {
        setCatalog({ catalog: nextRequest.catalog, error: null, loading: false });
      } else {
        setCatalog({ catalog: null, error: null, loading: true });
        void loadDialogCatalog({ currentRequestSeq: () => requestSeqRef.current, requestSeq, setCatalog, t });
      }
    };
    window.addEventListener(DISCOURSE_PUBLISH_DIALOG_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(DISCOURSE_PUBLISH_DIALOG_REQUEST_EVENT, handleRequest);
  }, [t]);
  useEffect(() => {
    const currentCatalog = catalog.catalog;
    if (!request || !currentCatalog) return;
    setForm((current) => withCatalogDefaults(current, currentCatalog));
  }, [catalog.catalog, request]);
  return { catalog, form, request, setForm, setRequest, setShowAllCategories, setShowAllTags, showAllCategories, showAllTags };
}
