import { ArchiveRestore, ArrowDownLeft, ListTree, Search, Share2, Copy, X, SlidersHorizontal } from 'lucide-react';
import { useContext, useRef } from 'react';
import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { FlowExitHereContext } from '../shared/ui/FlowExitHereContext';

import { CompanionBottomSheet as ReadingBottomSheet } from './CompanionBottomSheet';
import { CompanionColorModeControl } from './CompanionColorModeControl';
import type { CompanionEditHistoryActionsProps } from './CompanionEditHistoryActions';
import { CompanionFlowOrEditHistoryActions } from './CompanionFlowHistorySurface';
import { CompanionFlowModeControl } from './CompanionFlowModeControl';
import { CompanionNodePrioritySlider } from './CompanionNodePrioritySlider';
import { CompanionReadingDisplayControls } from './CompanionReadingDisplayControls';
import { CompanionReadingModeControl } from './CompanionReadingModeControl';
import { CompanionReadingTypographyControls } from './CompanionReadingTypographyControls';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import { CompanionWorkspaceMenuActions, companionWorkspaceRowClass } from './CompanionWorkspaceMenuActions';
import { useCompanionTrashRestoreAction } from './useCompanionTrashRestoreAction';

export { ReadingBottomSheet };

function ReadingActionRow(props: {
  icon: ReactNode;
  label: string;
  onClick(): void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`${companionWorkspaceRowClass} gap-3 font-medium text-foreground transition-colors active:bg-companion-subtle/80`}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      <span className="shrink-0 text-companion-text-secondary">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  );
}

function ReadingBacklinksAction(props: { onClose(): void; onOpen?: (() => void) | undefined }) {
  const t = useTranslation();
  if (!props.onOpen) return null;
  return <ReadingActionRow icon={<ArrowDownLeft aria-hidden="true" className="h-5 w-5" />}
    label={t('desktop.links.backlinks')}
    onClick={() => { props.onClose(); props.onOpen?.(); }} />;
}

function ReadingRestoreErrorMessage({ saved }: { saved: boolean }) {
  const t = useTranslation();
  return (
    <p className="border-b border-companion-divider py-3 text-sm text-error" role="status">
      {t(saved ? 'companion.reading.restoredRefreshError' : 'companion.reading.restoreError')}
    </p>
  );
}

function ReadingExitFlowHereAction(props: { onClose(): void }) {
  const exitHere = useContext(FlowExitHereContext);
  const t = useTranslation();
  if (!exitHere) return null;
  return <ReadingActionRow icon={<X aria-hidden="true" className="h-5 w-5" />}
    label={t('desktop.workspace.leaveFlowHere')}
    onClick={() => { props.onClose(); exitHere(); }} />;
}

function useDocumentSearchFocusHandoff(openSearch: () => void) {
  const openingSearch = useRef(false);
  return {
    openSearch() {
      openingSearch.current = true;
      openSearch();
    },
    onCloseAutoFocus(event: Event) {
      if (openingSearch.current) event.preventDefault();
      openingSearch.current = false;
    }
  };
}

export function ReadingActionsSheet(props: {
  editHistory?: CompanionEditHistoryActionsProps;
  nodeId?: string;
  priorityNodeId?: string;
  onFindInDocument(): void;
  onOpenOutline?: () => void;
  onOpenBacklinks?: () => void;
  onOpenChange(open: boolean): void;
  onOpenReadingSheet(sheet: 'font'): void;
  onOpenClozeRemoval?: () => void;
  articleHandoff?: { run(): void; error: string | null };
  articleCopy?: { run(): void; error: string | null };
  title?: string;
  onRestoreFromTrash?: () => Promise<void> | void;
  open: boolean;
}) {
  const t = useTranslation();
  const restore = useCompanionTrashRestoreAction(props);
  const search = useDocumentSearchFocusHandoff(props.onFindInDocument);
  const openReadingSheet = (sheet: 'font') => {
    props.onOpenChange(false);
    props.onOpenReadingSheet(sheet);
  };
  return (
    <ReadingBottomSheet hideCloseButton showScrollIndicator onOpenChange={props.onOpenChange} open={props.open} title={props.title || t('companion.reading.actions')}
      onCloseAutoFocus={search.onCloseAutoFocus}>
      <ReadingWorkspaceActions nodeId={props.nodeId} onClose={() => props.onOpenChange(false)} hasRestoreAction={Boolean(props.onRestoreFromTrash)}>
        <CompanionFlowOrEditHistoryActions open={props.open} {...(props.editHistory ? { editHistory: props.editHistory } : {})} />
        <CompanionFlowModeControl onSelect={() => props.onOpenChange(false)} />
        <ReadingExitFlowHereAction onClose={() => props.onOpenChange(false)} />
        <CompanionNodePrioritySlider nodeId={props.priorityNodeId} allowFlowTopic onSaved={() => props.onOpenChange(false)} />
        <ReadingActionRow
          icon={<Search aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.reading.find')}
          onClick={search.openSearch}
        />
        <ReadingActionRow
          icon={<SlidersHorizontal aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.reading.font')}
          onClick={() => openReadingSheet('font')}
        />
        {props.onOpenOutline ? <ReadingActionRow
          icon={<ListTree aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.reading.outline')}
          onClick={() => { props.onOpenChange(false); props.onOpenOutline?.(); }}
        /> : null}
        <ReadingBacklinksAction onClose={() => props.onOpenChange(false)} onOpen={props.onOpenBacklinks} />
        {props.articleHandoff && <ReadingArticleHandoff {...props.articleHandoff} />}
        {props.articleCopy && <ReadingArticleHandoff {...props.articleCopy} copy />}
        {props.onOpenClozeRemoval ? <ReadingActionRow
          icon={<X aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.selection.deleteCloze')}
          onClick={props.onOpenClozeRemoval}
        /> : null}
        {props.onRestoreFromTrash && <ReadingTrashRestoreAction restore={restore} />}
      </ReadingWorkspaceActions>
    </ReadingBottomSheet>
  );
}

function ReadingWorkspaceActions({ nodeId, onClose, hasRestoreAction, children }: {
  nodeId?: string | undefined;
  onClose(): void;
  hasRestoreAction: boolean;
  children: ReactNode;
}) {
  const workspace = useCompanionWorkspaceActions();
  if (!workspace || !nodeId || !isAvailableNativeCompanionRuntime()) return children;
  return <CompanionWorkspaceMenuActions nodeId={nodeId} hasRestoreAction={hasRestoreAction} withIcons
    onSaved={onClose} onSelect={state => { onClose(); workspace.open(state); }}>
    {children}
  </CompanionWorkspaceMenuActions>;
}

function ReadingArticleHandoff(props: { run(): void; error: string | null; copy?: boolean }) {
  const t = useTranslation();
  const Icon = props.copy ? Copy : Share2;
  return (
    <>
      <ReadingActionRow icon={<Icon aria-hidden="true" className="h-5 w-5" />}
        label={t(props.copy ? 'companion.reading.copyArticle' : 'companion.reading.shareArticle')} onClick={props.run} />
      {props.error && <p role="status" className="py-2 text-sm text-error">{props.error}</p>}
    </>
  );
}

function ReadingTrashRestoreAction({ restore }: { restore: ReturnType<typeof useCompanionTrashRestoreAction> }) {
  const t = useTranslation();
  return (
          <>
            {restore.error ? <ReadingRestoreErrorMessage saved={restore.error === 'refresh'} /> : null}
            <ReadingActionRow
              icon={<ArchiveRestore aria-hidden="true" className="h-5 w-5" />}
              label={t(restore.error === 'refresh' ? 'companion.selection.refresh' : 'companion.reading.restoreFromTrash')}
              disabled={restore.pending}
              onClick={restore.restore}
            />
          </>
  );
}

export { OutlineSheet } from './CompanionOutlineSheet';

export function ReadingFontSheet(props: {
  onChange(settings: CompanionReadingTypographySettings): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  settings: CompanionReadingTypographySettings;
  saveError?: boolean | undefined;
  fontLoadError?: boolean | undefined;
}) {
  const t = useTranslation();
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.font')}>
      <CompanionColorModeControl modeOnly />
      <CompanionReadingModeControl />
      <CompanionReadingDisplayControls />
      {props.fontLoadError ? <p className="py-3 text-sm text-error" role="alert">{t('companion.reading.font.loadError')}</p> : null}
      {props.saveError ? (
        <p className="py-3 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p>
      ) : null}
      <CompanionReadingTypographyControls onChange={props.onChange} settings={props.settings} />
    </ReadingBottomSheet>
  );
}
