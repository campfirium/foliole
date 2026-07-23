import { useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';

import type { NativeWordPressPostStatus } from '../../../lib/platform/nativeWordPressPublishContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import { publishTopicToWordPress } from '../../shared/platform/wordpressPublishRepository';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppSpinner,
  settingsFieldClassName
} from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { toTags, type PublishFormState } from './discoursePublishDialogModel';
import { DiscoursePublishFields, type CatalogState } from './DiscoursePublishFields';
import { useWordPressPublishDialogRequest } from './useWordPressPublishDialogRequest';
import { readWordPressPublishDetails } from './wordpressPublishDialogModel';
import type { WordPressPublishDialogRequest } from './wordpressPublishDialogRequest';

type PublishState = 'idle' | 'publishing';

function useWordPressPublishAction(args: {
  catalog: CatalogState;
  details: ReturnType<typeof readWordPressPublishDetails> | null;
  form: PublishFormState;
  onComplete: () => void;
  request: WordPressPublishDialogRequest | null;
  status: NativeWordPressPostStatus;
}) {
  const t = useTranslation();
  const [state, setState] = useState<PublishState>('idle');
  const [error, setError] = useState<string | null>(null);
  const publish = async () => {
    if (!args.request || !args.details || args.details.parseError) return;
    setState('publishing');
    setError(null);
    try {
      const result = await publishTopicToWordPress({
        category: (() => {
          const selected = args.catalog.catalog?.categories.find((entry) => String(entry.id) === args.form.categoryId);
          return selected ? { id: selected.id, name: selected.name } : null;
        })(),
        content: args.request.content,
        status: args.status,
        tags: toTags(args.form.tags).map((name) => {
          const selected = args.catalog.catalog?.tags.find((entry) => entry.name === name);
          return { id: selected ? Number(selected.id) : null, name };
        }),
        title: args.details.title
      });
      const saved = await useWorkspaceStore.getState().updateNodeContent(args.request.nodeId, result.updated_content);
      if (!saved) throw new Error(t('desktop.wordpressPublish.error.localSave'));
      args.onComplete();
      showAppRuntimeNotice(t(result.mode === 'created'
        ? 'desktop.wordpressPublish.created'
        : 'desktop.wordpressPublish.updated'), 'success', {
        label: t('desktop.wordpressPublish.viewPost'),
        onSelect: () => void openExternalUrl(result.url)
      });
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : t('desktop.wordpressPublish.error.publish'));
    } finally {
      setState('idle');
    }
  };
  return { clearError: () => setError(null), error, publish: () => void publish(), state };
}

type WordPressDialogProps = {
  action: ReturnType<typeof useWordPressPublishAction>;
  catalog: CatalogState;
  close: () => void;
  closePanels: () => void;
  details: NonNullable<ReturnType<typeof readWordPressPublishDetails>>;
  form: PublishFormState;
  panelsOpen: boolean;
  setForm: (form: PublishFormState) => void;
  setShowAllCategories: Dispatch<SetStateAction<boolean>>;
  setShowAllTags: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<NativeWordPressPostStatus>>;
  showAllCategories: boolean;
  showAllTags: boolean;
  status: NativeWordPressPostStatus;
};

function WordPressPublishDialogBody(props: WordPressDialogProps & { canPublish: boolean }) {
  const t = useTranslation();
  return <>
    <div className="mt-5">
      <label className="block text-sm font-medium text-foreground">
        {t('desktop.wordpressPublish.status')}
        <select aria-label={t('desktop.wordpressPublish.status')} className={`${settingsFieldClassName()} mt-1`} disabled={props.action.state !== 'idle'} onChange={(event) => props.setStatus(event.target.value as NativeWordPressPostStatus)} value={props.status}>
          <option value="draft">{t('desktop.wordpressPublish.status.draft')}</option>
          <option value="publish">{t('desktop.wordpressPublish.status.publish')}</option>
        </select>
      </label>
    </div>
    <DiscoursePublishFields catalog={props.catalog} categoryPlaceholder={t('desktop.wordpressPublish.category.placeholder')} form={props.form} setForm={props.setForm} showAllCategories={props.showAllCategories} showAllTags={props.showAllTags} toggleShowAllCategories={() => props.setShowAllCategories((current) => !current)} toggleShowAllTags={() => props.setShowAllTags((current) => !current)} />
    {props.catalog.loading ? (
      <div aria-busy="true" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <AppSpinner decorative size="sm" />
        <span>{t('desktop.wordpressPublish.catalog.loading')}</span>
      </div>
    ) : null}
    {props.catalog.error ? <p className="mt-3 text-sm text-destructive" role="alert">{props.catalog.error}</p> : null}
    {props.details.parseError ? <p className="mt-3 text-sm text-destructive" role="alert">{props.details.parseError}</p> : null}
    {props.action.error ? <p className="mt-3 text-sm text-destructive" role="alert">{props.action.error}</p> : null}
    <div className="mt-5 flex justify-end gap-2">
      <AppButton disabled={props.action.state !== 'idle'} onClick={props.close} variant="subtle">{t('common.cancel')}</AppButton>
      <AppButton disabled={!props.canPublish} loading={props.action.state === 'publishing'} onClick={props.action.publish}>{t('desktop.wordpressPublish.confirm')}</AppButton>
    </div>
  </>;
}

function WordPressPublishDialog(props: WordPressDialogProps) {
  const t = useTranslation();
  const canPublish = props.action.state === 'idle' && !props.details.parseError && !props.catalog.loading && !props.catalog.error;
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    if (canPublish) props.action.publish();
  };
  const handleEscapeKeyDown = (event: Event) => {
    event.preventDefault();
    if (props.action.state !== 'idle') return;
    if (props.panelsOpen) props.closePanels();
    else props.close();
  };
  return (
    <AppDialog open onOpenChange={(open) => !open && props.action.state === 'idle' && props.close()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="w-[min(960px,calc(100vw-32px))] p-6" onEscapeKeyDown={handleEscapeKeyDown} onKeyDownCapture={handleKeyDownCapture}>
          <AppDialogTitle>{t('desktop.wordpressPublish.dialogTitle')}</AppDialogTitle>
          <WordPressPublishDialogBody {...props} canPublish={canPublish} />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function WordPressPublishDialogHost() {
  const {
    catalog, form, request, setForm, setRequest, setShowAllCategories, setShowAllTags,
    setStatus, showAllCategories, showAllTags, status
  } = useWordPressPublishDialogRequest();
  const details = request ? readWordPressPublishDetails(request.content, request.title) : null;
  const action = useWordPressPublishAction({ catalog, details, form, onComplete: () => setRequest(null), request, status });
  if (!request || !details) return null;
  const panelsOpen = showAllCategories || showAllTags;
  const close = () => {
    action.clearError();
    setRequest(null);
  };
  const closePanels = () => {
    setShowAllCategories(false);
    setShowAllTags(false);
  };
  return <WordPressPublishDialog action={action} catalog={catalog} close={close} closePanels={closePanels} details={details} form={form} panelsOpen={panelsOpen} setForm={setForm} setShowAllCategories={setShowAllCategories} setShowAllTags={setShowAllTags} setStatus={setStatus} showAllCategories={showAllCategories} showAllTags={showAllTags} status={status} />;
}
