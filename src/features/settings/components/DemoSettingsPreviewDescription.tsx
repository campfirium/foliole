import type { DemoSettingsPreviewNoteKind } from '../model/demoSettingsPreviewCatalog';

import { useTranslation } from '@/shared/localization/LocalizationProvider';
import type { TranslationKey } from '@/shared/localization/translations';

export function DemoSettingsPreviewDescription(props: {
  descriptionKey: TranslationKey;
  noteKind: DemoSettingsPreviewNoteKind | null;
}) {
  const t = useTranslation();
  return (
    <>
      <span>{t(props.descriptionKey)}</span>
      {props.noteKind ? (
        <span className="mt-1 block text-foreground/58">
          <span className="font-medium text-foreground/66">{t('settings.demoPreview.note.label')}: </span>
          {t(getDemoSettingsPreviewNoteKey(props.noteKind))}
        </span>
      ) : null}
    </>
  );
}

function getDemoSettingsPreviewNoteKey(kind: DemoSettingsPreviewNoteKind): TranslationKey {
  switch (kind) {
    case 'desktop-only':
      return 'settings.demoPreview.note.desktopOnly';
    case 'read-only':
      return 'settings.demoPreview.note.readOnly';
    case 'preview-only':
      return 'settings.demoPreview.note.previewOnly';
  }
}
