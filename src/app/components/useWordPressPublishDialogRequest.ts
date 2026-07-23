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

function applyCatalog(
  loaded: NativeWordPressPublishCatalog,
  setCatalog: (catalog: CatalogState) => void,
  setForm: (form: PublishFormState) => void
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
  setForm({
    categoryId: loaded.selected_category_id ? String(loaded.selected_category_id) : '',
    tags: loaded.selected_tags.join(', ')
  });
}

export function useWordPressPublishDialogRequest() {
  const t = useTranslation();
  const [request, setRequest] = useState<WordPressPublishDialogRequest | null>(null);
  const [form, setForm] = useState<PublishFormState>({ categoryId: '', tags: '' });
  const [catalog, setCatalog] = useState<CatalogState>({ catalog: null, error: null, loading: false });
  const [status, setStatus] = useState<NativeWordPressPostStatus>('draft');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const next = readWordPressPublishDialogRequest(event);
      if (!next) return;
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      const details = readWordPressPublishDetails(next.content, next.title);
      setRequest(next);
      setForm({ categoryId: '', tags: '' });
      setStatus('draft');
      setShowAllCategories(false);
      setShowAllTags(false);
      if (next.catalog) {
        applyCatalog(next.catalog, setCatalog, setForm);
        return;
      }
      setCatalog({ catalog: null, error: null, loading: true });
      void loadWordPressPublishCatalogFromRuntime(details.postId ? { post_id: details.postId } : undefined)
        .then((loaded) => {
          if (requestSeq !== requestSeqRef.current || !loaded) return;
          applyCatalog(loaded, setCatalog, setForm);
        })
        .catch(() => {
          if (requestSeq !== requestSeqRef.current) return;
          setCatalog({ catalog: null, error: t('desktop.wordpressPublish.catalog.error'), loading: false });
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
