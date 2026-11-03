import { useRef } from 'react';

import { fontFaceLabel, fontFamily } from './companionReadingFonts';
import { type CustomFontProps, useReadingCustomFonts } from './useReadingCustomFonts';

import { useTranslation } from '@/shared/localization/LocalizationProvider';

export function CompanionReadingCustomFonts(props: CustomFontProps) {
  const t = useTranslation();
  const model = useReadingCustomFonts(props);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetId = useRef<string | undefined>(undefined);
  function pickFiles(id?: string) {
    targetId.current = id;
    fileInputRef.current?.click();
  }
  return (
    <div className="border-b border-companion-divider pb-4">
      {model.fonts.map(font => (
        <div className="border-b border-companion-divider py-2" key={font.id}>
          <div className="flex items-center gap-2">
            <button aria-pressed={props.settings.fontFamily === `custom:${font.id}`} disabled={model.busy}
              className={`min-h-10 min-w-0 flex-1 truncate rounded-md border px-3 text-left text-sm ${
                props.settings.fontFamily === `custom:${font.id}`
                  ? 'border-companion-accent bg-companion-accent-soft text-companion-accent'
                  : 'border-companion-divider text-foreground'
              }`}
              onClick={() => void model.selectFont(font.id)} type="button">{font.name}</button>
            <button aria-label={`${t('companion.reading.font.remove')} ${font.name}`} disabled={model.busy}
              className="min-h-10 px-2 text-sm text-companion-text-secondary"
              onClick={() => void model.removeFont(font.id)} type="button">{t('companion.reading.font.remove')}</button>
          </div>
          <details className="text-sm text-companion-text-secondary">
            <summary className="min-h-10 py-2">{font.faces.map(fontFaceLabel).join(', ')}</summary>
            {font.faces.map(face => <div className="flex items-center justify-between" key={face.id}>
              <span>{fontFaceLabel(face)}</span>
              <button className="min-h-10 px-2" disabled={model.busy}
                aria-label={`${t('companion.reading.font.remove')} ${font.name} ${fontFaceLabel(face)}`}
                onClick={() => void model.removeFont(font.id, face.id)} type="button">{t('companion.reading.font.remove')}</button>
            </div>)}
            <button className="min-h-10" disabled={model.busy} onClick={() => pickFiles(font.id)} type="button">
              {t('companion.reading.font.addVariants')}
            </button>
          </details>
        </div>
      ))}
      <button className="mt-2 flex min-h-10 w-full items-center justify-center rounded-md border border-companion-divider px-3 text-sm font-medium text-foreground"
        disabled={model.busy || Boolean(model.prepared)} onClick={() => pickFiles()} type="button">
        {t('companion.reading.font.import')}
      </button>
      <input accept=".ttf,.otf,font/ttf,font/otf" className="hidden" multiple ref={fileInputRef}
        onChange={event => {
          void model.prepareFiles(Array.from(event.target.files ?? []), targetId.current);
          event.target.value = '';
        }} type="file" />
      <FontImportPreview model={model} />
      {model.error ? <p className="pt-2 text-sm text-error" role="alert">{t(`companion.reading.font.${model.error}`)}</p> : null}
    </div>
  );
}

function FontImportPreview({ model }: { model: ReturnType<typeof useReadingCustomFonts> }) {
  const t = useTranslation();
return model.prepared ? <div className="py-3 text-sm" aria-label={t('companion.reading.font.preview')}>
        {model.prepared.records.map(record => <p key={record.id}>
          {record.name}: {fontFamily(record).faces.map(fontFaceLabel).join(', ')}
        </p>)}
        <div className="flex gap-4">
          <button className="min-h-10" disabled={model.busy} onClick={() => void model.confirmImport()} type="button">
            {t('companion.reading.font.confirm')}
          </button>
          <button className="min-h-10" disabled={model.busy} onClick={model.cancelImport} type="button">
            {t('companion.reading.font.cancel')}
          </button>
        </div>
      </div> : null;
}
