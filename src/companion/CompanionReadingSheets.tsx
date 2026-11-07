import { ListTree, Info, RotateCcw, Search, X, SlidersHorizontal } from 'lucide-react';
import { useContext } from 'react';
import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { FlowExitHereContext } from '../shared/ui/FlowExitHereContext';

import { CompanionBottomSheet as ReadingBottomSheet } from './CompanionBottomSheet';
import type { CompanionEditHistoryActionsProps } from './CompanionEditHistoryActions';
import { CompanionFlowOrEditHistoryActions } from './CompanionFlowHistorySurface';
import { CompanionFlowModeControl } from './CompanionFlowModeControl';
import { CompanionNodePrioritySlider } from './CompanionNodePrioritySlider';
import { CompanionReadingDisplayControls } from './CompanionReadingDisplayControls';
import { CompanionReadingModeControl } from './CompanionReadingModeControl';
import { CompanionReadingTypographyControls } from './CompanionReadingTypographyControls';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';
import { CompanionWorkspaceCurrentNodeAction } from './CompanionWorkspaceActions';
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
      className="flex w-full items-center gap-3 border-b border-companion-divider py-4 text-left text-sm font-medium text-foreground transition-colors active:bg-companion-subtle/80"
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      <span className="text-companion-text-secondary">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  );
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

export function ReadingActionsSheet(props: {
  editHistory?: CompanionEditHistoryActionsProps;
  priorityNodeId?: string;
  onFindInDocument(): void;
  onOpenOutline?: () => void;
  onOpenChange(open: boolean): void;
  onOpenReadingSheet(sheet: 'font' | 'info'): void;
  onOpenClozeRemoval?: () => void;
  onRestoreFromTrash?: () => Promise<void> | void;
  open: boolean;
}) {
  const t = useTranslation();
  const restore = useCompanionTrashRestoreAction(props);
  const openReadingSheet = (sheet: 'font' | 'info') => {
    props.onOpenChange(false);
    props.onOpenReadingSheet(sheet);
  };
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.actions')}>
      <div className="border-t border-companion-divider">
        <CompanionFlowOrEditHistoryActions open={props.open} {...(props.editHistory ? { editHistory: props.editHistory } : {})} />
        <CompanionFlowModeControl onSelect={() => props.onOpenChange(false)} />
        <ReadingExitFlowHereAction onClose={() => props.onOpenChange(false)} />
        <CompanionNodePrioritySlider nodeId={props.priorityNodeId} onSaved={() => props.onOpenChange(false)} />
        <CompanionWorkspaceCurrentNodeAction onSelect={() => props.onOpenChange(false)} />
        <ReadingActionRow
          icon={<Search aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.reading.find')}
          onClick={props.onFindInDocument}
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
        <ReadingActionRow
          icon={<Info aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.reading.info')}
          onClick={() => openReadingSheet('info')}
        />
        {props.onOpenClozeRemoval ? <ReadingActionRow
          icon={<X aria-hidden="true" className="h-5 w-5" />}
          label={t('companion.selection.deleteCloze')}
          onClick={props.onOpenClozeRemoval}
        /> : null}
        {props.onRestoreFromTrash && <ReadingTrashRestoreAction restore={restore} />}
      </div>
    </ReadingBottomSheet>
  );
}

function ReadingTrashRestoreAction({ restore }: { restore: ReturnType<typeof useCompanionTrashRestoreAction> }) {
  const t = useTranslation();
  return (
          <>
            {restore.error ? <ReadingRestoreErrorMessage saved={restore.error === 'refresh'} /> : null}
            <ReadingActionRow
              icon={<RotateCcw aria-hidden="true" className="h-5 w-5" />}
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

export function ReadingInfoSheet(props: {
  hasPdf: boolean;
  onOpenChange(open: boolean): void;
  open: boolean;
  title: string;
}) {
  const t = useTranslation();
  return (
    <ReadingBottomSheet onOpenChange={props.onOpenChange} open={props.open} title={t('companion.reading.info')}>
      <dl className="border-t border-companion-divider text-sm">
        <div className="flex items-center justify-between border-b border-companion-divider py-3">
          <dt className="text-companion-text-secondary">{t('companion.reading.info.topic')}</dt>
          <dd className="min-w-0 max-w-[70%] truncate text-right text-foreground">{props.title}</dd>
        </div>
        <div className="flex items-center justify-between border-b border-companion-divider py-3">
          <dt className="text-companion-text-secondary">{t('companion.reading.info.source')}</dt>
          <dd className="text-foreground">{props.hasPdf ? t('companion.reading.info.pdfAndText') : t('companion.reading.info.text')}</dd>
        </div>
      </dl>
    </ReadingBottomSheet>
  );
}
