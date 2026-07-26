import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionNodeTextAlternative } from '../shared/platform/companion/runtime/companionNodeTextAlternativeRepository';

import { ReadingBottomSheet } from './CompanionReadingSheets';

export function CompanionNodeTextAlternativeSheet(props: {
  alternative: CompanionNodeTextAlternative | null;
  busy: boolean;
  currentBody: string;
  error: boolean;
  onDismiss(): void;
  onOpenChange(open: boolean): void;
  onSetAsBody(): void;
  open: boolean;
}) {
  const t = useTranslation();
  if (!props.alternative) return null;
  return (
    <ReadingBottomSheet
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={t('companion.reading.alternative.title')}
    >
      <div className="space-y-4 border-t border-companion-divider pt-4">
        <TextPanel body={props.currentBody} label={t('companion.reading.alternative.current')} />
        <TextPanel body={props.alternative.body_text} label={t('companion.reading.alternative.other')} />
        {props.error ? (
          <p className="text-sm text-danger">{t('companion.reading.alternative.error')}</p>
        ) : null}
        <div className="flex justify-end gap-3 pb-2">
          <button
            className="rounded-md px-4 py-2 text-sm font-medium text-companion-text-secondary"
            disabled={props.busy}
            onClick={props.onDismiss}
            type="button"
          >
            {t('companion.reading.alternative.dismiss')}
          </button>
          <button
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            disabled={props.busy}
            onClick={props.onSetAsBody}
            type="button"
          >
            {props.busy
              ? t('companion.reading.alternative.setting')
              : t('companion.reading.alternative.setAsBody')}
          </button>
        </div>
      </div>
    </ReadingBottomSheet>
  );
}

function TextPanel(props: { body: string; label: string }) {
  return (
    <section className="rounded-lg border border-companion-divider bg-companion-content p-3">
      <h3 className="mb-2 text-xs font-medium text-companion-text-secondary">{props.label}</h3>
      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">{props.body}</p>
    </section>
  );
}
