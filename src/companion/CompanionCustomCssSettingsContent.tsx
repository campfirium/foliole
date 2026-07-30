import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { createCompanionUuid } from '../shared/platform/companionUuid';

import { CompanionCustomCssConfirmDialog } from './CompanionCustomCssConfirmDialog';
import { CompanionCustomCssEditorDialog } from './CompanionCustomCssEditorDialog';
import type { CompanionCustomCssSnippet } from './companionCustomCssModel';
import {
  useCompanionCustomCss,
  type CompanionCustomCssSaveResult
} from './CompanionCustomCssProvider';
import { CompanionCustomCssSettingsSurface } from './CompanionCustomCssSettingsSurface';

function createDraft(): CompanionCustomCssSnippet {
  return { enabled: true, id: createCompanionUuid(), name: '', sourceCss: '' };
}

function useSnippetCollectionSave(
  customCss: ReturnType<typeof useCompanionCustomCss>,
  setIsBusy: Dispatch<SetStateAction<boolean>>
) {
  return useCallback(async (snippets: CompanionCustomCssSnippet[]) => {
    setIsBusy(true);
    const result = await customCss.saveCollection({ snippets, version: 1 });
    setIsBusy(false);
    return result;
  }, [customCss, setIsBusy]);
}

async function finishConfirmedAction(args: {
  action: 'delete' | 'reset' | null;
  customCss: ReturnType<typeof useCompanionCustomCss>;
  draft: CompanionCustomCssSnippet | null;
  saveCollection(snippets: CompanionCustomCssSnippet[]): Promise<CompanionCustomCssSaveResult>;
  saveError: string;
  setActionError: Dispatch<SetStateAction<string | null>>;
  setConfirmAction: Dispatch<SetStateAction<'delete' | 'reset' | null>>;
  setDraft: Dispatch<SetStateAction<CompanionCustomCssSnippet | null>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
}) {
  if (!args.action) return;
  const snippets = args.draft
    ? args.customCss.collection.snippets.filter((snippet) => snippet.id !== args.draft?.id)
    : [];
  args.setIsBusy(true);
  const result = args.action === 'reset'
    ? await args.customCss.resetCollection()
    : await args.saveCollection(snippets);
  args.setIsBusy(false);
  if (!result.ok) {
    args.setActionError(args.saveError);
    return;
  }
  args.setConfirmAction(null);
  args.setDraft(null);
  args.setActionError(null);
}

function resolveProviderError(issue: ReturnType<typeof useCompanionCustomCss>['issue'], t: ReturnType<typeof useTranslation>) {
  if (!issue) return null;
  if (issue === 'invalid') return t('companion.settings.appearance.css.invalidError');
  if (issue === 'sync') return t('companion.settings.appearance.css.syncError');
  return t('companion.settings.appearance.css.saveError');
}

function useCustomCssSettingsModel() {
  const t = useTranslation();
  const customCss = useCompanionCustomCss();
  const [draft, setDraft] = useState<CompanionCustomCssSnippet | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'delete' | 'reset' | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isExistingDraft = Boolean(draft && customCss.collection.snippets.some((snippet) => snippet.id === draft.id));
  const saveCollection = useSnippetCollectionSave(customCss, setIsBusy);

  function updateDraft(nextDraft: CompanionCustomCssSnippet) {
    customCss.markDraftEdited();
    setDraft(nextDraft);
    setEditorError(null);
  }

  async function handleSaveDraft() {
    if (!draft) return;
    const snippets = isExistingDraft
      ? customCss.collection.snippets.map((snippet) => snippet.id === draft.id ? draft : snippet)
      : [...customCss.collection.snippets, draft];
    const result = await saveCollection(snippets);
    if (result.ok) {
      setDraft(null);
      setActionError(null);
      return;
    }
    setEditorError(t(result.kind === 'invalid'
      ? 'companion.settings.appearance.css.validationError'
      : 'companion.settings.appearance.css.saveError'));
  }

  async function handleToggle(snippet: CompanionCustomCssSnippet) {
    const result = await saveCollection(customCss.collection.snippets.map((candidate) => (
      candidate.id === snippet.id ? { ...candidate, enabled: !candidate.enabled } : candidate
    )));
    setActionError(result.ok ? null : t('companion.settings.appearance.css.saveError'));
  }

  const handleConfirmedAction = () => finishConfirmedAction({
    action: confirmAction,
    customCss,
    draft,
    saveCollection,
    saveError: t('companion.settings.appearance.css.saveError'),
    setActionError,
    setConfirmAction,
    setDraft,
    setIsBusy
  });

  return {
    actionError, confirmAction, customCss, draft, editorError, handleConfirmedAction,
    handleSaveDraft, handleToggle, isBusy, isExistingDraft, setConfirmAction, setDraft,
    setEditorError, updateDraft, providerError: resolveProviderError(customCss.issue, t)
  };
}

export function CompanionCustomCssSettingsContent() {
  const model = useCustomCssSettingsModel();
  return (
    <>
      <CompanionCustomCssSettingsSurface
        actionError={model.actionError}
        collection={model.customCss.collection}
        isBusy={model.isBusy}
        isInvalid={model.customCss.issue === 'invalid'}
        onAdd={() => { model.setEditorError(null); model.setDraft(createDraft()); }}
        onEdit={(snippet) => model.setDraft({ ...snippet })}
        onReset={() => model.setConfirmAction('reset')}
        onToggle={(snippet) => void model.handleToggle(snippet)}
        providerError={model.providerError}
      />
      <CompanionCustomCssEditorDialog
        draft={model.draft}
        error={model.editorError}
        isExisting={model.isExistingDraft}
        isSaving={model.isBusy}
        onCancel={() => model.setDraft(null)}
        onChange={model.updateDraft}
        onDelete={() => model.setConfirmAction('delete')}
        onSave={() => void model.handleSaveDraft()}
      />
      <CompanionCustomCssConfirmDialog
        action={model.confirmAction}
        isBusy={model.isBusy}
        onCancel={() => model.setConfirmAction(null)}
        onConfirm={() => void model.handleConfirmedAction()}
      />
    </>
  );
}
