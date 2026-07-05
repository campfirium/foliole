import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  loadDiscoursePublishCatalogFromRuntime,
  publishTopicToDiscourse
} from '../../shared/platform/discoursePublishRepository';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

import {
  readPublishDetails,
  readPublishTitle,
  toCategoryId,
  toTags,
  type PublishDetails,
  type PublishFormState
} from './discoursePublishDialogModel';
import {
  DISCOURSE_PUBLISH_DIALOG_REQUEST_EVENT,
  readDiscoursePublishDialogRequest,
  type DiscoursePublishDialogRequest
} from './discoursePublishDialogRequest';
import { DiscoursePublishFields, type CatalogState } from './DiscoursePublishFields';
import { withCatalogDefaults } from './discoursePublishFieldUtils';
import { useDiscourseEscapeClose } from './DiscourseShortcutPicker';

type PublishState = 'idle' | 'publishing';
type SetCatalogState = (state: CatalogState | ((current: CatalogState) => CatalogState)) => void;

async function loadDialogCatalog(args: {
  currentRequestSeq: () => number;
  requestSeq: number;
  setCatalog: SetCatalogState;
  t: ReturnType<typeof useTranslation>;
}) {
  const isCurrentRequest = () => args.requestSeq === args.currentRequestSeq();
  try {
    const cachedCatalog = await loadDiscoursePublishCatalogFromRuntime();
    if (!isCurrentRequest()) return;
    if (!cachedCatalog) {
      args.setCatalog({ catalog: null, error: null, loading: false });
      return;
    }
    if (!cachedCatalog.from_cache) {
      args.setCatalog({ catalog: cachedCatalog, error: null, loading: false });
      return;
    }
    args.setCatalog({ catalog: cachedCatalog, error: null, loading: true });
  } catch {
    if (!isCurrentRequest()) return;
    args.setCatalog({ catalog: null, error: args.t('desktop.discoursePublish.catalog.error'), loading: false });
    return;
  }
  try {
    const nextCatalog = await loadDiscoursePublishCatalogFromRuntime({ refresh: true });
    if (!isCurrentRequest()) return;
    args.setCatalog({
      catalog: nextCatalog,
      error: nextCatalog?.from_cache ? args.t('desktop.discoursePublish.catalog.error') : null,
      loading: false
    });
  } catch {
    if (!isCurrentRequest()) return;
    args.setCatalog((current) => ({
      catalog: current.catalog,
      error: args.t('desktop.discoursePublish.catalog.error'),
      loading: false
    }));
  }
}

function useDiscoursePublishDialogRequest() {
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
      setForm({
        categoryId: details.categoryId ? String(details.categoryId) : '',
        tags: details.tags.join(', ')
      });
      setShowAllCategories(false);
      setShowAllTags(false);
      if (nextRequest.catalog) {
        setCatalog({ catalog: nextRequest.catalog, error: null, loading: false });
        return;
      }
      setCatalog({ catalog: null, error: null, loading: true });
      void loadDialogCatalog({
        currentRequestSeq: () => requestSeqRef.current,
        requestSeq,
        setCatalog,
        t
      });
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

function DiscoursePublishDialog(props: {
  details: PublishDetails;
  error: string | null;
  catalog: CatalogState;
  form: PublishFormState;
  onClose: () => void;
  onClosePanels: () => void;
  onPublish: () => void;
  setForm: (form: PublishFormState) => void;
  showAllCategories: boolean;
  showAllTags: boolean;
  state: PublishState;
  toggleShowAllCategories: () => void;
  toggleShowAllTags: () => void;
}) {
  const t = useTranslation();
  const canPublish = props.state === 'idle' && !props.details.parseError && props.form.categoryId.trim().length > 0;
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || !canPublish) return;
    event.preventDefault();
    props.onPublish();
  };
  useDiscourseEscapeClose(props.showAllCategories || props.showAllTags, props.onClosePanels);
  const handleEscapeKeyDown = (event: Event) => {
    if (!props.showAllCategories && !props.showAllTags) return;
    event.preventDefault();
    props.onClosePanels();
  };
  return (
    <AppDialog open onOpenChange={(open) => !open && props.state === 'idle' && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="w-[min(960px,calc(100vw-32px))] p-6" onEscapeKeyDown={handleEscapeKeyDown} onKeyDownCapture={handleKeyDownCapture}>
          <AppDialogTitle>{t('desktop.discoursePublish.title')}</AppDialogTitle>
          <DiscoursePublishFields catalog={props.catalog} form={props.form} setForm={props.setForm} showAllCategories={props.showAllCategories} showAllTags={props.showAllTags} toggleShowAllCategories={props.toggleShowAllCategories} toggleShowAllTags={props.toggleShowAllTags} />
          {props.catalog.error ? <p className="mt-3 text-sm text-muted-foreground">{t('desktop.discoursePublish.catalog.error')}</p> : null}
          {props.details.parseError ? <p className="mt-3 text-sm text-destructive" role="alert">{props.details.parseError}</p> : null}
          {props.error ? <p className="mt-3 text-sm text-destructive" role="alert">{props.error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <AppButton disabled={props.state !== 'idle'} onClick={props.onClose} tabIndex={-1} variant="subtle">{t('common.cancel')}</AppButton>
            <AppButton disabled={!canPublish} onClick={props.onPublish}>{props.state === 'publishing' ? t('desktop.discoursePublish.publishing') : t('desktop.discoursePublish.confirm')}</AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function DiscoursePublishDialogHost() {
  const t = useTranslation();
  const { catalog, form, request, setForm, setRequest, setShowAllCategories, setShowAllTags, showAllCategories, showAllTags } = useDiscoursePublishDialogRequest();
  const [state, setState] = useState<PublishState>('idle');
  const [error, setError] = useState<string | null>(null);
  if (!request) return null;
  const details = readPublishDetails(request.content);
  const close = () => setRequest(null);
  const closePanels = () => {
    setShowAllCategories(false);
    setShowAllTags(false);
  };
  const publish = async () => {
    if (details.parseError) {
      setError(details.parseError);
      return;
    }
    setState('publishing');
    setError(null);
    try {
      const result = await publishTopicToDiscourse({
        category_id: toCategoryId(form.categoryId, t('desktop.discoursePublish.error.category')),
        content: request.content,
        tags: toTags(form.tags),
        title: readPublishTitle(request.content, request.title)
      });
      const saved = await useWorkspaceStore.getState().updateNodeContent(request.nodeId, result.updated_content);
      if (!saved) throw new Error(t('desktop.discoursePublish.error.localSave'));
      close();
      showAppRuntimeNotice(t(result.mode === 'created' ? 'desktop.discoursePublish.created' : 'desktop.discoursePublish.updated'), 'success');
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : t('desktop.discoursePublish.error.publish'));
    } finally {
      setState('idle');
    }
  };
  return <DiscoursePublishDialog catalog={catalog} details={details} error={error} form={form} onClose={close} onClosePanels={closePanels} onPublish={publish} setForm={setForm} showAllCategories={showAllCategories} showAllTags={showAllTags} state={state} toggleShowAllCategories={() => setShowAllCategories((current) => !current)} toggleShowAllTags={() => setShowAllTags((current) => !current)} />;
}
