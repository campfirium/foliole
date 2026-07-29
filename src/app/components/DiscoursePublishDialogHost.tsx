import { useEffect, useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { publishTopicToDiscourse, saveDiscoursePublishDraftToRuntime } from '../../shared/platform/discoursePublishRepository';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import {
  AppButton,
  AppDialog,
  AppDialogActions,
  AppDialogBody,
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
import { DiscoursePublishFields, type CatalogState } from './DiscoursePublishFields';
import { useDiscoursePublishDialogEscape } from './useDiscoursePublishDialogEscape';
import { useDiscoursePublishDialogRequest } from './useDiscoursePublishDialogRequest';

type PublishState = 'idle' | 'publishing';

function DiscoursePublishFeedback(props: {
  catalogError: string | null;
  error: string | null;
  parseError: string | null;
}) {
  return (
    <>
      {props.catalogError ? <p className="mt-3 text-sm text-muted-foreground">{props.catalogError}</p> : null}
      {props.parseError ? <p className="mt-3 text-sm text-destructive" role="alert">{props.parseError}</p> : null}
      {props.error ? <p className="mt-3 text-sm text-destructive" role="alert">{props.error}</p> : null}
    </>
  );
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
  const panelsOpen = props.showAllCategories || props.showAllTags;
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!canPublish) return;
    props.onPublish();
  };
  useDiscoursePublishDialogEscape({
    onClose: props.onClose,
    onClosePanels: props.onClosePanels,
    panelsOpen,
    state: props.state
  });
  const handleEscapeKeyDown = (event: Event) => {
    event.preventDefault();
    if (props.state !== 'idle') return;
    if (panelsOpen) {
      props.onClosePanels();
      return;
    }
    props.onClose();
  };
  return (
    <AppDialog open onOpenChange={(open) => !open && props.state === 'idle' && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="w-[min(960px,calc(100vw-32px))]" layout="task" onEscapeKeyDown={handleEscapeKeyDown} onKeyDownCapture={handleKeyDownCapture}>
          <AppDialogTitle>{t('desktop.discoursePublish.title')}</AppDialogTitle>
          <AppDialogBody>
            <DiscoursePublishFields catalog={props.catalog} form={props.form} setForm={props.setForm} showAllCategories={props.showAllCategories} showAllTags={props.showAllTags} toggleShowAllCategories={props.toggleShowAllCategories} toggleShowAllTags={props.toggleShowAllTags} />
            <DiscoursePublishFeedback catalogError={props.catalog.error ? t('desktop.discoursePublish.catalog.error') : null} error={props.error} parseError={props.details.parseError} />
          </AppDialogBody>
          <AppDialogActions>
            <AppButton disabled={props.state !== 'idle'} onClick={props.onClose} tabIndex={-1} variant="subtle">{t('common.cancel')}</AppButton>
            <AppButton disabled={!canPublish} loading={props.state === 'publishing'} loadingLabel={t('desktop.discoursePublish.publishing')} onClick={props.onPublish}>{t('desktop.discoursePublish.confirm')}</AppButton>
          </AppDialogActions>
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
  useEffect(() => setError(null), [request]);
  if (!request) return null;
  const details = readPublishDetails(request.content);
  const closePanels = () => {
    setShowAllCategories(false);
    setShowAllTags(false);
  };
  const currentDraft = () => ({
    category_id: Number.isInteger(Number(form.categoryId)) && Number(form.categoryId) > 0
      ? Number(form.categoryId)
      : null,
    tags: toTags(form.tags)
  });
  const close = () => {
    setError(null);
    closePanels();
    void saveDiscoursePublishDraftToRuntime(request.nodeId, currentDraft())
      .catch(() => showAppRuntimeNotice(t('desktop.discoursePublish.error.draftSave')))
      .finally(() => setRequest(null));
  };
  const publish = async () => {
    if (details.parseError) {
      setError(details.parseError);
      return;
    }
    setState('publishing');
    setError(null);
    try {
      await saveDiscoursePublishDraftToRuntime(request.nodeId, currentDraft()).catch(() => null);
      const result = await publishTopicToDiscourse({
        category_id: toCategoryId(form.categoryId, t('desktop.discoursePublish.error.category')),
        content: request.content,
        tags: toTags(form.tags),
        title: readPublishTitle(request.content, request.title)
      });
      const saved = await useWorkspaceStore.getState().updateNodeContent(request.nodeId, result.updated_content);
      if (!saved) throw new Error(t('desktop.discoursePublish.error.localSave'));
      await saveDiscoursePublishDraftToRuntime(request.nodeId, null).catch(() => null);
      setRequest(null);
      showAppRuntimeNotice(
        t(result.mode === 'created' ? 'desktop.discoursePublish.created' : 'desktop.discoursePublish.updated'),
        'success',
        { label: t('desktop.discoursePublish.openTopic'), onSelect: () => void openExternalUrl(result.url) }
      );
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : t('desktop.discoursePublish.error.publish'));
    } finally {
      setState('idle');
    }
  };
  return <DiscoursePublishDialog catalog={catalog} details={details} error={error} form={form} onClose={close} onClosePanels={closePanels} onPublish={publish} setForm={setForm} showAllCategories={showAllCategories} showAllTags={showAllTags} state={state} toggleShowAllCategories={() => setShowAllCategories((current) => !current)} toggleShowAllTags={() => setShowAllTags((current) => !current)} />;
}
