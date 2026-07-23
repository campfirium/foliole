import { useEffect, useRef, useState } from 'react';

import type {
  NativeWordPressPostStatus,
  NativeWordPressPublishCatalog
} from '../../../lib/platform/nativeWordPressPublishContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { loadWordPressPublishCatalogFromRuntime } from '../../shared/platform/wordpressPublishRepository';

import type { PublishFormState } from './discoursePublishDialogModel';
import type { CatalogState } from './DiscoursePublishFields';
import { readWordPressPublishDetails } from './wordpressPublishDialogModel';
import {
  readWordPressPublishDialogRequest,
  WORDPRESS_PUBLISH_DIALOG_REQUEST_EVENT,
  type WordPressPublishDialogRequest
} from './wordpressPublishDialogRequest';

type SetCatalogState = (state: CatalogState | ((current: CatalogState) => CatalogState)) => void;

function applyCatalog(
  loaded: NativeWordPressPublishCatalog,
  setCatalog: SetCatalogState,
  setForm: (form: PublishFormState) => void,
  applySelection = true
) {
  setCatalog({
    catalog: {
      categories: loaded.categories,
      recent_tags: [],
      tags: loaded.tags.map((tag) => ({ id: String(tag.id), name: tag.name }))
    },
    error: null,
    loading: false
  });
  if (applySelection) {
    setForm({
      categoryId: loaded.selected_category_id ? String(loaded.selected_category_id) : '',
      tags: loaded.selected_tags.join(', ')
    });
  }
}

async function loadDialogCatalog(args: {
  currentFormRevision: () => number;
  currentRequestSeq: () => number;
  postId: string | null;
  requestSeq: number;
  setCatalog: SetCatalogState;
  setForm: (form: PublishFormState) => void;
  t: ReturnType<typeof useTranslation>;
}) {
  const isCurrent = () => args.requestSeq === args.currentRequestSeq();
  try {
    const cached = await loadWordPressPublishCatalogFromRuntime(
      args.postId ? { post_id: args.postId } : undefined
    );
    if (!isCurrent()) return;
    if (!cached) throw new Error('WordPress runtime unavailable');
    applyCatalog(cached, args.setCatalog, args.setForm);
    if (!cached.from_cache) return;
    const formRevision = args.currentFormRevision();
    const refreshed = await loadWordPressPublishCatalogFromRuntime({
      ...(args.postId ? { post_id: args.postId } : {}),
      refresh: true
    });
    if (!isCurrent()) return;
    if (!refreshed) throw new Error('WordPress runtime unavailable');
    applyCatalog(refreshed, args.setCatalog, args.setForm, args.currentFormRevision() === formRevision);
  } catch {
    if (!isCurrent()) return;
    args.setCatalog((current) => ({
      catalog: current.catalog,
      error: current.catalog ? null : args.t('desktop.wordpressPublish.catalog.error'),
      loading: false
    }));
  }
}

export function useWordPressPublishDialogRequest() {
  const t = useTranslation();
  const [request, setRequest] = useState<WordPressPublishDialogRequest | null>(null);
  const [form, setFormState] = useState<PublishFormState>({ categoryId: '', tags: '' });
  const [catalog, setCatalog] = useState<CatalogState>({ catalog: null, error: null, loading: false });
  const [status, setStatus] = useState<NativeWordPressPostStatus>('publish');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const requestSeqRef = useRef(0);
  const formRevisionRef = useRef(0);
  const setForm = (next: PublishFormState) => {
    formRevisionRef.current += 1;
    setFormState(next);
  };

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const next = readWordPressPublishDialogRequest(event);
      if (!next) return;
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      const details = readWordPressPublishDetails(next.content, next.title);
      formRevisionRef.current = 0;
      setRequest(next);
      setFormState({ categoryId: '', tags: '' });
      setStatus('publish');
      setShowAllCategories(false);
      setShowAllTags(false);
      if (next.catalog) {
        applyCatalog(next.catalog, setCatalog, setFormState);
        return;
      }
      setCatalog({ catalog: null, error: null, loading: true });
      void loadDialogCatalog({
        currentFormRevision: () => formRevisionRef.current,
        currentRequestSeq: () => requestSeqRef.current,
        postId: details.postId,
        requestSeq,
        setCatalog,
        setForm: setFormState,
        t
      });
    };
    window.addEventListener(WORDPRESS_PUBLISH_DIALOG_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(WORDPRESS_PUBLISH_DIALOG_REQUEST_EVENT, handleRequest);
  }, [t]);

  return {
    catalog, form, request, setForm, setRequest, setShowAllCategories, setShowAllTags,
    setStatus, showAllCategories, showAllTags, status
  };
}
