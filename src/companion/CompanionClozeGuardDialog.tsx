import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppDialogBody, AppDialogContent, AppDialogDescription, AppDialogOverlay,
  AppDialogPortal, AppDialogTitle, AppNoticeDialog } from '../shared/ui';
import { AppChoiceDialog } from '../shared/ui/AppChoiceDialog';

export function CompanionClozeGuardDialog(props: {
  disabled: boolean;
  onCancel(): void;
  onChoose(kind: 'cloze' | 'highlight'): void;
  status: ReactNode;
}) {
  const t = useTranslation();
  return <AppNoticeDialog open onOpenChange={open => { if (!open && !props.disabled) props.onCancel(); }}>
    <AppDialogPortal>
      <AppDialogOverlay data-companion-selection-toolbar="true" />
      <AppDialogContent data-companion-selection-toolbar="true" layout="notice"
        onEscapeKeyDown={event => { if (props.disabled) event.preventDefault(); }}>
        <AppDialogTitle>{t('desktop.clozeGuard.title')}</AppDialogTitle>
        <AppDialogBody>
          <AppDialogDescription>{t('desktop.clozeGuard.description')}</AppDialogDescription>
          {props.status}
          <fieldset disabled={props.disabled}>
            <AppChoiceDialog options={{ title: t('desktop.clozeGuard.title'), choices: [
              { value: 'highlight', label: t('desktop.clozeGuard.highlight'), tone: 'primary' },
              { value: 'cloze', label: t('desktop.clozeGuard.cloze') }
            ] }} onChoose={value => props.onChoose(value as 'cloze' | 'highlight')} />
            <AppButton className="mt-2 min-h-11 w-full" variant="ghost" onClick={props.onCancel}>
              {t('common.cancel')}
            </AppButton>
          </fieldset>
        </AppDialogBody>
      </AppDialogContent>
    </AppDialogPortal>
  </AppNoticeDialog>;
}
