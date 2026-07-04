import { useEffect, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  loadDiscoursePublishCatalogFromRuntime,
  loadDiscoursePublishSettingsFromRuntime,
  publishTopicToDiscourse
} from '../../shared/platform/discoursePublishRepository';
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

type PublishState = 'idle' | 'publishing';
type TargetState = { siteUrl: string } | null;

function useDiscoursePublishDialogRequest() {
  const t = useTranslation();
  const [request, setRequest] = useState<DiscoursePublishDialogRequest | null>(null);
  const [target, setTarget] = useState<TargetState>(null);
  const [form, setForm] = useState<PublishFormState>({ categoryId: '', tags: '' });
  const [catalog, setCatalog] = useState<CatalogState>({ catalog: null, error: null, loading: false });
  const [showAllTags, setShowAllTags] = useState(false);
  useEffect(() => {
    const handleRequest = (event: Event) => {
      const nextRequest = readDiscoursePublishDialogRequest(event);
      if (!nextRequest) return;
      setRequest(nextRequest);
      const details = readPublishDetails(nextRequest.content);
      setForm({
        categoryId: details.categoryId ? String(details.categoryId) : '',
        tags: details.tags.join(', ')
      });
      setShowAllTags(false);
      if (nextRequest.catalog) {
        setTarget(nextRequest.targetSiteUrl ? { siteUrl: nextRequest.targetSiteUrl } : null);
        setCatalog({ catalog: nextRequest.catalog, error: null, loading: false });
        return;
      }
      setCatalog({ catalog: null, error: null, loading: true });
      void loadDiscoursePublishSettingsFromRuntime().then((settings) => {
        setTarget(settings ? {
          siteUrl: settings.site_url
        } : null);
      });
      void loadDiscoursePublishCatalogFromRuntime({ refresh: true })
        .then((nextCatalog) => {
          setCatalog({
            catalog: nextCatalog,
            error: nextCatalog?.from_cache ? t('desktop.discoursePublish.catalog.error') : null,
            loading: false
          });
        })
        .catch((error) => {
          void loadDiscoursePublishCatalogFromRuntime()
            .then((cachedCatalog) => setCatalog({
              catalog: cachedCatalog,
              error: error instanceof Error ? error.message : 'Could not refresh categories and tags.',
              loading: false
            }))
            .catch((cachedError) => setCatalog({
              catalog: null,
              error: cachedError instanceof Error ? cachedError.message : 'Could not load categories and tags.',
              loading: false
            }));
        });
    };
    window.addEventListener(DISCOURSE_PUBLISH_DIALOG_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(DISCOURSE_PUBLISH_DIALOG_REQUEST_EVENT, handleRequest);
  }, [t]);
  return { catalog, form, request, setForm, setRequest, setShowAllTags, showAllTags, target };
}

function DiscoursePublishDetails(props: {
  details: PublishDetails;
  request: DiscoursePublishDialogRequest;
  target: TargetState;
}) {
  const t = useTranslation();
  return (
    <div className="mt-4 grid gap-3 rounded-md border border-border/70 bg-muted/25 p-4 text-sm">
      <div><span className="text-muted-foreground">{t('desktop.discoursePublish.topic')}</span> {readPublishTitle(props.request.content, props.request.title)}</div>
      <div><span className="text-muted-foreground">{t('desktop.discoursePublish.target')}</span> {props.target?.siteUrl || '-'}</div>
      <div><span className="text-muted-foreground">{t('desktop.discoursePublish.mode')}</span> {t(props.details.mode === 'create' ? 'desktop.discoursePublish.mode.create' : 'desktop.discoursePublish.mode.update')}</div>
      {props.details.bindingUrl ? <div><span className="text-muted-foreground">{t('desktop.discoursePublish.bound')}</span> {props.details.bindingUrl}</div> : null}
    </div>
  );
}

function DiscoursePublishDialog(props: {
  details: PublishDetails;
  error: string | null;
  catalog: CatalogState;
  form: PublishFormState;
  onClose: () => void;
  onPublish: () => void;
  request: DiscoursePublishDialogRequest;
  setForm: (form: PublishFormState) => void;
  showAllTags: boolean;
  state: PublishState;
  target: TargetState;
  toggleShowAllTags: () => void;
}) {
  const t = useTranslation();
  const canPublish = props.state === 'idle' && !props.details.parseError && props.form.categoryId.trim().length > 0;
  return (
    <AppDialog open onOpenChange={(open) => !open && props.state === 'idle' && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="w-[min(680px,calc(100vw-32px))] p-5">
          <AppDialogTitle>{t('desktop.discoursePublish.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-2 text-sm leading-6 text-foreground/70">{t('desktop.discoursePublish.description')}</AppDialogDescription>
          <DiscoursePublishDetails details={props.details} request={props.request} target={props.target} />
          <DiscoursePublishFields catalog={props.catalog} form={props.form} setForm={props.setForm} showAllTags={props.showAllTags} toggleShowAllTags={props.toggleShowAllTags} />
          {props.catalog.loading ? <p className="mt-3 text-sm text-muted-foreground">{t('desktop.discoursePublish.catalog.loading')}</p> : null}
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
  const { catalog, form, request, setForm, setRequest, setShowAllTags, showAllTags, target } = useDiscoursePublishDialogRequest();
  const [state, setState] = useState<PublishState>('idle');
  const [error, setError] = useState<string | null>(null);
  if (!request) return null;
  const details = readPublishDetails(request.content);
  const close = () => setRequest(null);
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
  return <DiscoursePublishDialog catalog={catalog} details={details} error={error} form={form} onClose={close} onPublish={publish} request={request} setForm={setForm} showAllTags={showAllTags} state={state} target={target} toggleShowAllTags={() => setShowAllTags((current) => !current)} />;
}
